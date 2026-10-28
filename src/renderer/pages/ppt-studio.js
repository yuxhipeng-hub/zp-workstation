import {
  createPresentation,
  presentationId,
  PRESENTATION_THEMES,
  PRESENTATION_LAYOUTS,
  PRESENTATION_SCENES,
  buildSlideScene,
  getPresentationIssues,
} from '../../shared/presentation.mjs'

/** 独立 PPT 页面：手动和 AI 共同编辑结构化作品，只有显式保存才写入工作区。 */
export function createPptStudioPage({
  state,
  api,
  escapeHtml: esc,
  render,
  toast,
  openChoiceDialog,
  activeAiProfile,
}) {
  let draft = null
  let saved = ''
  let selected = 0
  let history = []
  let future = []
  let editKey = ''
  let busy = ''
  let error = ''
  let candidate = null
  let presenting = false
  let briefOpen = false
  let reportedDirty = false
  const brief = { title: '', audience: '', goal: '', material: '', scene: 'proposal', pageCount: 8 }
  const copy = (value) => structuredClone(value)
  const signature = (value) => JSON.stringify(value)
  const dirty = () => Boolean(draft && signature(draft) !== saved)
  const projects = () => state.workspace?.presentations || []
  function reportDirty() {
    const value = dirty()
    if (reportedDirty === value) return
    reportedDirty = value
    api.setPresentationDirty(value).catch(() => {
      reportedDirty = !value
    })
  }
  const disabled = (value) => (value ? 'disabled' : '')
  const options = (values, current) =>
    Object.entries(values)
      .map(
        ([id, label]) =>
          `<option value="${id}" ${id === current ? 'selected' : ''}>${esc(label)}</option>`,
      )
      .join('')
  function button(action, label, icon, attrs = '', secondary = true) {
    return `<button type="button" class="button ${secondary ? 'secondary' : 'primary'}" data-action="ppt-${action}" ${attrs}>${icon ? `<i data-lucide="${icon}"></i>` : ''}<span>${esc(label)}</span></button>`
  }
  function iconButton(action, label, icon, attrs = '') {
    return `<button type="button" class="ppt-icon-button" data-action="ppt-${action}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}><i data-lucide="${icon}"></i></button>`
  }
  function setDraft(value, isSaved = false) {
    draft = copy(value)
    saved = isSaved ? signature(draft) : ''
    selected = 0
    history = []
    future = []
    editKey = ''
    candidate = null
    error = ''
    briefOpen = false
    presenting = false
  }
  function checkpoint() {
    if (!draft) return
    history.push({ draft: copy(draft), selected })
    if (history.length > 50) history.shift()
    future = []
    editKey = ''
  }
  async function save() {
    if (!draft || busy) return false
    const snapshot = copy(draft)
    busy = 'saving'
    error = ''
    render()
    try {
      state.workspace = await api.savePresentation(snapshot)
      const stored = projects().find((item) => item.id === snapshot.id)
      draft = copy(stored)
      saved = signature(draft)
      toast('作品已保存到本机。', 'success')
      return true
    } catch (err) {
      error = `保存失败：${err.message}。当前草稿仍保留，请重试。`
      return false
    } finally {
      busy = ''
      render()
    }
  }
  async function canReplace() {
    if (!dirty()) return true
    const choice = await openChoiceDialog({
      title: '当前作品尚未保存',
      description: '切换前，你可以保存这份作品，或放弃本次修改。',
      label: '如何处理当前草稿',
      options: [
        { value: 'save', label: '保存后继续' },
        { value: 'discard', label: '放弃修改' },
      ],
      value: 'save',
      confirmLabel: '继续',
    })
    if (choice === 'save') return save()
    return choice === 'discard'
  }
  function slideMarkup(slide, theme, index, total) {
    const scene = buildSlideScene(slide, theme, index, total)
    const nodes = scene.nodes
      .map((node) => {
        const style = `left:${node.x / 12.8}%;top:${node.y / 7.2}%;width:${node.w / 12.8}%;height:${node.h / 7.2}%;`
        return node.type === 'rect'
          ? `<span class="ppt-shape" style="${style}background:#${node.color}"></span>`
          : `<span class="ppt-text" style="${style}color:#${node.color};font-family:'${node.font}',sans-serif;font-size:${node.size / 12.8}cqw;font-weight:${node.bold ? 700 : 400}">${esc(node.text)}</span>`
      })
      .join('')
    return `<div class="ppt-slide" style="background:#${scene.background}" role="img" aria-label="第 ${index + 1} 页：${esc(slide.title || '未填写标题')}">${nodes}</div>`
  }
  function previewMarkup() {
    if (!draft) return ''
    return slideMarkup(draft.slides[selected], draft.theme, selected, draft.slides.length)
  }
  function issuesMarkup() {
    if (!draft) return ''
    const issues = getPresentationIssues(draft)
    return issues.length
      ? `<div class="ppt-checks" aria-live="polite"><strong>交付检查 · ${issues.length} 项提醒</strong>${issues.map((issue) => `<p>第 ${issue.page} 页 · ${esc(issue.message)}</p>`).join('')}</div>`
      : '<div class="ppt-checks ppt-checks-ok">文字容量检查通过 · 导出后建议检查字体与换行</div>'
  }
  function field(scope, key, label, value, max, multiline = false, hint = '') {
    const attrs = `id="ppt-${scope}-${key}" data-ppt-scope="${scope}" data-ppt-field="${key}" maxlength="${max}" ${disabled(Boolean(busy))}`
    return `<label class="ppt-field" for="ppt-${scope}-${key}"><span>${esc(label)}</span>${multiline ? `<textarea ${attrs} rows="${key === 'notes' || key === 'material' ? 5 : 3}">${esc(value)}</textarea>` : `<input ${attrs} value="${esc(value)}" autocomplete="off">`}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`
  }
  function briefMarkup() {
    const profile = activeAiProfile()
    return `<section class="ppt-brief" aria-label="演示创作需求">
      <div class="ppt-section-heading"><div><span class="ppt-kicker">从目的出发</span><h2>这次，你想讲清什么？</h2><p>先确定听众与目标，再组织内容。已有作品会在你采用大纲后更新。</p></div>${button('close-brief', '收起', 'chevron-up', disabled(Boolean(busy)))}</div>
      <div class="ppt-brief-grid">
        ${field('brief', 'title', '演示主题', brief.title, 100)}
        <label class="ppt-field"><span>使用场景</span><select data-ppt-scope="brief" data-ppt-field="scene" ${disabled(Boolean(busy))}>${options(PRESENTATION_SCENES, brief.scene)}</select></label>
        ${field('brief', 'audience', '听众是谁', brief.audience, 160)}
        <label class="ppt-field"><span>大纲页数</span><select data-ppt-scope="brief" data-ppt-field="pageCount" ${disabled(Boolean(busy))}>${[3, 4, 6, 8, 10, 12, 16].map((n) => `<option value="${n}" ${brief.pageCount === n ? 'selected' : ''}>${n} 页</option>`).join('')}</select></label>
        ${field('brief', 'goal', '希望听众记住什么，或采取什么行动', brief.goal, 500, true)}
        ${field('brief', 'material', '本次使用的材料与事实', brief.material, 12000, true, '只有这里主动输入的材料会发送给当前模型；不会读取资料库。')}
      </div>
      <div class="ppt-brief-actions"><p>${profile ? `当前模型：${esc(profile.label)} · ${esc(profile.model)}` : '尚未配置模型，仍可直接手动创作。'}</p><div>${!profile ? '<button class="button secondary" data-page-jump="ai">配置模型</button>' : ''}${button('manual', '从空白作品开始', 'plus', disabled(Boolean(busy)))}${button('generate', busy === 'generating' ? '正在策划大纲…' : '生成 AI 大纲', 'sparkles', disabled(Boolean(busy) || !profile), false)}</div></div>
      ${busy === 'generating' ? '<p class="ppt-notice" role="status">正在组织内容，请稍候。生成结果先供核对，采用后才会更新草稿。</p>' : ''}
    </section>`
  }
  function candidateMarkup() {
    if (!candidate) return ''
    return `<section class="ppt-candidate" aria-label="待确认的 AI 大纲"><div class="ppt-section-heading"><div><span class="ppt-kicker">先核对，再采用</span><h2>${esc(candidate.deck.title)}</h2><p>${esc(candidate.profile.label)} · ${candidate.deck.slides.length} 页。请补齐待补充项，并核实所有事实。</p></div><div class="ppt-inline-actions">${button('reject', '暂不采用', 'x')}${button('adopt', '采用这版大纲', 'check', '', false)}</div></div><ol>${candidate.deck.slides.map((slide) => `<li><strong>${esc(slide.title)}</strong><span>${esc(slide.body)}</span></li>`).join('')}</ol></section>`
  }
  function landingMarkup() {
    const sample = createPresentation({ title: '把好想法，\n讲得更动人' })
    return `<section class="ppt-welcome"><div class="ppt-welcome-copy"><span class="ppt-kicker">PRESENTATION STUDIO</span><h2>好内容，值得<br>一个好舞台。</h2><p>从提案、汇报到技术分享。先想清楚要说什么，再让每一页成为有分量的表达。</p><div class="ppt-inline-actions">${button('new', '开始创作', 'plus', '', false)}${button('quick', '试试手动编辑', 'pen-line')}</div><small>本地保存 · 三种视觉主题 · 可编辑 PPTX</small></div><div class="ppt-welcome-art" aria-hidden="true">${slideMarkup(sample.slides[0], 'editorial', 0, 3)}</div></section>`
  }
  function galleryMarkup() {
    return `<section class="ppt-gallery" aria-label="本地作品"><div class="ppt-section-heading"><div><span class="ppt-kicker">本地作品</span><h2>继续上次的想法</h2></div><span>${projects().length} 份作品</span></div>${
      projects().length
        ? `<div class="ppt-project-grid">${projects()
            .map(
              (deck) =>
                `<article class="ppt-project"><button class="ppt-project-open" data-action="ppt-open" data-id="${esc(deck.id)}"><div class="ppt-project-preview">${slideMarkup(deck.slides[0], deck.theme, 0, deck.slides.length)}</div><strong>${esc(deck.title)}</strong><span>${esc(PRESENTATION_SCENES[deck.scene])} · ${deck.slides.length} 页</span></button>${iconButton('delete-project', `删除作品：${deck.title}`, 'trash-2', `data-id="${esc(deck.id)}"`)}</article>`,
            )
            .join('')}</div>`
        : '<div class="ppt-empty"><i data-lucide="panels-top-left"></i><p>你的第一份作品，将从这里开始。</p><span>保存后可以随时回来继续修改。</span></div>'
    }</section>`
  }
  function editorMarkup() {
    const slide = draft.slides[selected]
    return `<section class="ppt-editor" aria-label="PPT 编辑器" aria-busy="${Boolean(busy)}">
      <div class="ppt-editor-bar"><div class="ppt-editor-identity">${iconButton('home', '返回作品', 'arrow-left', disabled(Boolean(busy)))}<div><strong data-ppt-project-title>${esc(draft.title)}</strong><span data-ppt-save-state>${dirty() ? '有未保存的修改' : '已保存到本机'} · ${draft.slides.length} 页</span></div></div><div class="ppt-inline-actions">${iconButton('undo', '撤销修改', 'undo-2', disabled(!history.length || Boolean(busy)))}${iconButton('redo', '重做修改', 'redo-2', disabled(!future.length || Boolean(busy)))}${button('brief', 'AI 大纲', 'sparkles', disabled(Boolean(busy)))}${button('present', '演示', 'play', disabled(Boolean(busy)))}${button('save', busy === 'saving' ? '保存中…' : '保存作品', 'save', disabled(Boolean(busy)))}${button('export', busy === 'exporting' ? '导出中…' : '导出 PPTX', 'download', disabled(Boolean(busy)), false)}</div></div>
      <div class="ppt-editor-grid">
        <aside class="ppt-filmstrip" aria-label="幻灯片列表" data-scroll-preserve="ppt-pages"><div class="ppt-filmstrip-head"><span>页面</span>${iconButton('add-slide', '添加页面', 'plus', disabled(Boolean(busy) || draft.slides.length >= 40))}</div>${draft.slides.map((item, i) => `<button class="ppt-thumbnail ${selected === i ? 'is-selected' : ''}" data-action="ppt-select" data-index="${i}" aria-label="选择第 ${i + 1} 页" aria-pressed="${selected === i}" ${disabled(Boolean(busy))}><div class="ppt-thumbnail-art" data-ppt-thumb="${i}">${slideMarkup(item, draft.theme, i, draft.slides.length)}</div><span><b>${String(i + 1).padStart(2, '0')}</b><span data-ppt-thumb-title="${i}">${esc(item.title || '未填写标题')}</span></span></button>`).join('')}</aside>
        <div class="ppt-stage-column"><div class="ppt-stage-meta"><span data-ppt-page-label>第 ${selected + 1} 页 · ${esc(PRESENTATION_LAYOUTS[slide.layout])}</span><span>16 : 9</span></div><div class="ppt-stage" data-ppt-preview>${previewMarkup()}</div><div class="ppt-page-actions">${iconButton('move-up', '向前移动页面', 'arrow-up', disabled(selected === 0 || Boolean(busy)))}${iconButton('move-down', '向后移动页面', 'arrow-down', disabled(selected === draft.slides.length - 1 || Boolean(busy)))}${button('duplicate', '复制页面', 'copy', disabled(Boolean(busy) || draft.slides.length >= 40))}${iconButton('remove-slide', '删除当前页面', 'trash-2', disabled(draft.slides.length <= 1 || Boolean(busy)))}</div><div data-ppt-checks>${issuesMarkup()}</div><label class="ppt-notes-label">演讲备注<span>只进入备注，不挤占页面</span></label>${field('slide', 'notes', '当前页演讲备注', slide.notes, 4000, true)}</div>
        <aside class="ppt-inspector" aria-label="页面内容与设计" data-scroll-preserve="ppt-inspector"><div class="ppt-inspector-heading"><strong>内容与设计</strong><span>所有文字均可编辑</span></div>
          ${field('deck', 'title', '作品名称', draft.title, 100)}
          <label class="ppt-field"><span>视觉主题</span><select data-ppt-scope="deck" data-ppt-field="theme" ${disabled(Boolean(busy))}>${options(Object.fromEntries(Object.entries(PRESENTATION_THEMES).map(([id, theme]) => [id, theme.name])), draft.theme)}</select><small data-ppt-theme-description>${esc(PRESENTATION_THEMES[draft.theme].description)}</small></label>
          <label class="ppt-field"><span>页面版式</span><select data-ppt-scope="slide" data-ppt-field="layout" ${disabled(Boolean(busy))}>${options(PRESENTATION_LAYOUTS, slide.layout)}</select></label>
          ${field('slide', 'eyebrow', '页眉', slide.eyebrow, 60)}
          ${field('slide', 'title', '页面标题', slide.title, 100, true)}
          ${field('slide', 'body', '正文', slide.body, 1200, true)}
          ${field('slide', 'points', '要点（每行一项，最多 6 项）', slide.points.join('\n'), 965, true, '每个要点最多 160 字。')}
        </aside>
      </div>
    </section>`
  }
  function presentationMarkup() {
    return `<section class="ppt-presentation" aria-label="演示预览"><div class="ppt-section-heading"><strong>${esc(draft.title)}</strong>${button('stop-presenting', '退出演示', 'x')}</div><div class="ppt-stage">${previewMarkup()}</div><div class="ppt-presentation-controls">${button('previous', '上一页', 'chevron-left', disabled(selected === 0))}<span>${selected + 1} / ${draft.slides.length}</span>${button('next', '下一页', 'chevron-right', disabled(selected === draft.slides.length - 1))}</div><p class="ppt-presentation-notes">${esc(draft.slides[selected].notes || '使用左右方向键切换，Esc 返回编辑器。')}</p></section>`
  }
  function renderPage() {
    reportDirty()
    return `<div class="ppt-studio">${error ? `<div class="ppt-error" role="alert">${esc(error)}</div>` : ''}${presenting && draft ? presentationMarkup() : `${briefOpen ? briefMarkup() : ''}${candidateMarkup()}${draft ? editorMarkup() : `${!briefOpen ? landingMarkup() : ''}${galleryMarkup()}`}`}</div>`
  }
  function refreshPreview() {
    reportDirty()
    if (!draft) return
    const preview = document.querySelector('[data-ppt-preview]')
    if (preview) preview.innerHTML = previewMarkup()
    draft.slides.forEach((slide, i) => {
      const thumb = document.querySelector(`[data-ppt-thumb="${i}"]`)
      if (thumb) thumb.innerHTML = slideMarkup(slide, draft.theme, i, draft.slides.length)
    })
    document.querySelectorAll('[data-ppt-thumb-title]').forEach((element) => {
      element.textContent =
        draft.slides[Number(element.dataset.pptThumbTitle)].title || '未填写标题'
    })
    const status = document.querySelector('[data-ppt-save-state]')
    if (status)
      status.textContent = `${dirty() ? '有未保存的修改' : '已保存到本机'} · ${draft.slides.length} 页`
    const title = document.querySelector('[data-ppt-project-title]')
    if (title) title.textContent = draft.title
    const label = document.querySelector('[data-ppt-page-label]')
    if (label)
      label.textContent = `第 ${selected + 1} 页 · ${PRESENTATION_LAYOUTS[draft.slides[selected].layout]}`
    const checks = document.querySelector('[data-ppt-checks]')
    if (checks) checks.innerHTML = issuesMarkup()
    const theme = document.querySelector('[data-ppt-theme-description]')
    if (theme) theme.textContent = PRESENTATION_THEMES[draft.theme].description
    const undo = document.querySelector('[data-action="ppt-undo"]')
    if (undo) undo.disabled = history.length === 0
    const redo = document.querySelector('[data-action="ppt-redo"]')
    if (redo) redo.disabled = future.length === 0
  }
  function handleInput(element) {
    const key = element.dataset?.pptField
    if (!key) return false
    if (busy) return true
    const scope = element.dataset.pptScope
    if (scope === 'brief') {
      brief[key] = key === 'pageCount' ? Number(element.value) : element.value
      return true
    }
    if (!draft) return true
    const nextKey = `${scope}:${selected}:${key}`
    if (editKey !== nextKey) {
      checkpoint()
      editKey = nextKey
    }
    const target = scope === 'deck' ? draft : draft.slides[selected]
    target[key] = key === 'points' ? element.value.split('\n') : element.value
    refreshPreview()
    return true
  }
  async function handleAction(action, element) {
    if (!action.startsWith('ppt-')) return false
    if (busy) return true
    editKey = ''
    const command = action.slice(4)
    if (command === 'new' || command === 'quick' || command === 'manual') {
      if (!(await canReplace())) return true
      if (command === 'new') {
        briefOpen = true
        error = ''
        candidate = null
      } else setDraft(createPresentation(brief))
    } else if (command === 'brief') {
      brief.title = draft.title
      brief.scene = draft.scene
      brief.audience = draft.audience
      brief.goal = draft.goal
      briefOpen = true
      candidate = null
    } else if (command === 'close-brief') {
      briefOpen = false
    } else if (command === 'home') {
      if (!(await canReplace())) return true
      draft = null
      candidate = null
      briefOpen = false
    } else if (command === 'open') {
      if (!(await canReplace())) return true
      const project = projects().find((item) => item.id === element.dataset.id)
      if (project) setDraft(project, true)
    } else if (command === 'delete-project') {
      const project = projects().find((item) => item.id === element.dataset.id)
      if (!project) return true
      const choice = await openChoiceDialog({
        title: '删除这份作品？',
        description: project.title,
        label: '删除后可从工作区备份恢复。',
        options: [
          { value: 'keep', label: '保留作品' },
          { value: 'delete', label: '删除作品' },
        ],
        value: 'keep',
        confirmLabel: '确定',
      })
      if (choice !== 'delete') return true
      state.workspace = await api.deletePresentation(project.id)
      toast('作品已删除。')
    } else if (command === 'save') {
      await save()
      return true
    } else if (command === 'generate') {
      if (!brief.title.trim()) {
        error = '请先填写演示主题。'
        render()
        return true
      }
      busy = 'generating'
      error = ''
      candidate = null
      render()
      try {
        candidate = await api.generatePresentation(copy(brief))
      } catch (err) {
        error = `大纲生成失败：${err.message}。原作品未改变。`
      } finally {
        busy = ''
      }
    } else if (command === 'reject') {
      candidate = null
    } else if (command === 'adopt' && candidate) {
      const next = copy(candidate.deck)
      if (draft) {
        checkpoint()
        draft = {
          ...draft,
          title: next.title,
          scene: next.scene,
          audience: next.audience,
          goal: next.goal,
          slides: next.slides,
        }
        selected = 0
      } else setDraft(next)
      candidate = null
      briefOpen = false
    } else if (command === 'export' && draft) {
      busy = 'exporting'
      error = ''
      render()
      try {
        const result = await api.exportPresentation(copy(draft))
        if (!result.canceled) toast('可编辑 PPTX 已导出。', 'success')
      } catch (err) {
        error = `导出失败：${err.message}`
      } finally {
        busy = ''
      }
    } else if (draft) {
      if (command === 'select')
        selected = Math.max(
          0,
          Math.min(draft.slides.length - 1, Number(element.dataset.index) || 0),
        )
      else if (command === 'present') presenting = true
      else if (command === 'stop-presenting') presenting = false
      else if (command === 'previous') selected = Math.max(0, selected - 1)
      else if (command === 'next') selected = Math.min(draft.slides.length - 1, selected + 1)
      else if (command === 'undo' || command === 'redo') {
        const from = command === 'undo' ? history : future
        const to = command === 'undo' ? future : history
        const previous = from.pop()
        if (previous) {
          to.push({ draft: copy(draft), selected })
          draft = previous.draft
          selected = previous.selected
        }
      } else if ((command === 'add-slide' || command === 'duplicate') && draft.slides.length < 40) {
        checkpoint()
        const slide =
          command === 'duplicate'
            ? copy(draft.slides[selected])
            : { layout: 'split', title: '新的重点', eyebrow: '', body: '', points: [], notes: '' }
        slide.id = presentationId()
        draft.slides.splice(selected + 1, 0, slide)
        selected += 1
      } else if (command === 'remove-slide' && draft.slides.length > 1) {
        checkpoint()
        draft.slides.splice(selected, 1)
        selected = Math.min(selected, draft.slides.length - 1)
      } else if (command === 'move-up' || command === 'move-down') {
        const target = selected + (command === 'move-up' ? -1 : 1)
        if (target >= 0 && target < draft.slides.length) {
          checkpoint()
          const [slide] = draft.slides.splice(selected, 1)
          draft.slides.splice(target, 0, slide)
          selected = target
        }
      }
    }
    render()
    return true
  }
  function handleKeydown(event) {
    if (busy || !draft || document.querySelector('#dialogRoot [role="dialog"]')) return
    if (presenting) {
      if (event.key === 'Escape') presenting = false
      else if (event.key === 'ArrowRight' || event.key === ' ')
        selected = Math.min(draft.slides.length - 1, selected + 1)
      else if (event.key === 'ArrowLeft') selected = Math.max(0, selected - 1)
      else return
      event.preventDefault()
      render()
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }
  return { renderPage, handleAction, handleInput, handleKeydown }
}
