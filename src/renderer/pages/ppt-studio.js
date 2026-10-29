import {
  createPresentation,
  presentationId,
  PRESENTATION_THEMES,
  PRESENTATION_LAYOUTS,
  PRESENTATION_SCENES,
  buildSlideScene,
  getPresentationIssues,
} from '../../shared/presentation.mjs'
import { createPptCanvasEditor } from '../components/ppt-canvas-editor.js'
import { DESIGN_DIRECTIONS, materializeDesign } from '../../shared/presentation-design.mjs'

/** 独立 PPT 页面：手动和 AI 共同编辑结构化作品，只有显式保存才写入工作区。 */
export function createPptStudioPage({
  state,
  api,
  escapeHtml: esc,
  render,
  toast,
  openChoiceDialog,
  openSaveChangesDialog,
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
  let presenting = false
  let inspectorPanel = 'chat'
  let composer = ''
  let messages = []
  let reportedDirty = false
  let pendingDesign = null
  let visualReport = null
  let visualSignature = ''
  let visualJob = null
  const visualRevision = (deck) => signature({ ...deck, updatedAt: '', createdAt: '' })
  const canvasEditor = createPptCanvasEditor({
    getDeck: () => draft,
    getIndex: () => selected,
    checkpoint,
    render: () => {
      inspectorPanel = canvasEditor.isActive() ? 'objects' : 'chat'
      render()
    },
    refresh: refreshPreview,
    reportDirty,
    escapeHtml: esc,
    toast,
  })
  const copy = (value) => structuredClone(value)
  const signature = (value) => JSON.stringify(value)
  const dirty = () => Boolean(draft && signature(draft) !== saved)
  const projects = () => state.workspace?.presentations || []
  function reportDirty() {
    const value = dirty() || Boolean(pendingDesign)
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
    pendingDesign = null
    visualReport = null
    visualSignature = ''
    canvasEditor.reset()
    draft = copy(value)
    saved = isSaved ? signature(draft) : ''
    selected = 0
    history = []
    future = []
    editKey = ''
    messages = []
    composer = ''
    error = ''
    inspectorPanel = 'chat'
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
      reportDirty()
      render()
    }
  }
  async function canReplace(source) {
    if (!dirty() && !pendingDesign) return true
    const choice = await openSaveChangesDialog({ returnFocus: source })
    if (choice === 'save') {
      if (pendingDesign && !(await completeDesign())) return false
      return save()
    }
    return choice === 'discard'
  }
  function chatContext() {
    // 保留最初材料与最近对话；整份当前作品始终单独提交，不依赖历史描述恢复。
    if (!messages.length) return []
    const first = messages[0]
    const recent = []
    let length = first.content.length
    for (let i = messages.length - 1; i > 0 && recent.length < 19; i -= 1) {
      if (length + messages[i].content.length > 48000) break
      recent.unshift(messages[i])
      length += messages[i].content.length
    }
    return [first, ...recent]
  }
  async function sendMessage() {
    if (busy || !composer.trim() || !activeAiProfile()) return
    const message = composer.trim()
    const previous = copy(messages)
    const context = chatContext()
    const current = draft ? copy(draft) : null
    messages.push({ role: 'user', content: message })
    composer = ''
    busy = 'chatting'
    error = ''
    render()
    try {
      const result = await (current
        ? api.chatPresentation({
            message,
            history: context,
            deck: current,
            selectedSlideId: current?.slides[selected]?.id || null,
            selectedObjectId: canvasEditor.selectedId(),
          })
        : api.designPresentation({
            action: 'samples',
            message,
            history: context,
            direction: pendingDesign?.direction || 'precision',
          }))
      if (result.action === 'samples') {
        pendingDesign = {
          deck: result.deck,
          plan: result.plan,
          direction: result.deck.designDirection || 'precision',
          message,
        }
        messages.push({
          role: 'assistant',
          content: '三页设计样稿已准备好。可以切换视觉方向，或继续说明修改要求；满意后生成整套。',
        })
        return
      }
      if (result.deck) {
        if (draft) {
          const selectedId = draft.slides[selected]?.id
          checkpoint()
          draft = copy(result.deck)
          selected = Math.max(
            0,
            draft.slides.findIndex((slide) => slide.id === selectedId),
          )
        } else {
          const conversation = messages
          setDraft(result.deck)
          messages = conversation
        }
      }
      messages.push({ role: 'assistant', content: result.message })
    } catch (err) {
      messages = previous
      composer = message
      error = `处理失败：${err.message}。输入和原作品已保留，可以直接重试。`
    } finally {
      busy = ''
      reportDirty()
      render()
      if (state.page === 'ppt') {
        document.querySelector('#ppt-message')?.focus({ preventScroll: true })
        requestAnimationFrame(() => {
          const log = document.querySelector('.ppt-chat-log')
          if (log) log.scrollTop = log.scrollHeight
        })
      }
    }
  }
  async function completeDesign() {
    if (!pendingDesign || busy) return false
    const snapshot = copy(pendingDesign),
      conversation = copy(messages)
    let inspectAfter = false
    busy = 'design'
    error = ''
    render()
    try {
      const result = await api.designPresentation({
        action: 'complete',
        message: snapshot.message,
        history: chatContext(),
        plan: snapshot.plan,
        direction: snapshot.direction,
      })
      if (!result.deck) throw new Error('未返回完整作品。')
      setDraft(result.deck)
      messages = conversation
      if (messages.at(-1)?.role === 'assistant')
        messages[messages.length - 1] = { role: 'assistant', content: result.message }
      else messages.push({ role: 'assistant', content: result.message })
      visualReport = result.visualReport || null
      visualSignature = visualRevision(draft)
      inspectAfter = Boolean(result.autoInspect)
      return true
    } catch (err) {
      error = `整套生成失败：${err.message}。设计样稿与材料已保留。`
      return false
    } finally {
      busy = ''
      reportDirty()
      render()
      if (inspectAfter) void inspectInBackground()
    }
  }
  async function inspectInBackground(pageId = null) {
    if (!draft) return
    if (visualJob) {
      if (visualJob.projectId !== draft.id) {
        visualReport = { status: 'deferred', message: '另一份作品正在检查，完成后可检查当前作品。' }
        visualSignature = visualRevision(draft)
        render()
      }
      return
    }
    const snapshot = copy(draft)
    const job = { projectId: snapshot.id, revision: visualRevision(snapshot) }
    visualJob = job
    visualReport = { status: 'pending', message: '正在后台检查实际 PPTX 渲染，可以继续编辑。' }
    visualSignature = job.revision
    render()
    try {
      const result = await api.inspectPresentation({
        deck: snapshot,
        ...(pageId ? { pageId } : {}),
      })
      if (draft?.id !== job.projectId) return
      if (busy || visualRevision(draft) !== job.revision) {
        visualReport = {
          status: 'stale',
          message: '检查期间作品已修改，检查结果未自动应用，请重新检查。',
        }
        return
      }
      checkpoint()
      draft = copy(result.deck)
      visualReport = result.report
      visualSignature = visualRevision(draft)
    } catch (error) {
      if (draft?.id === job.projectId)
        visualReport = { status: 'failed', message: `视觉检查失败：${error.message}。原稿已保留。` }
    } finally {
      if (visualJob === job) visualJob = null
      reportDirty()
      render()
    }
  }
  function designSamplesMarkup() {
    if (!pendingDesign) return ''
    return `<section class="ppt-design-samples" aria-label="三页设计样稿"><div class="ppt-section-heading"><div><h3>先确定设计方向</h3><p>从 ${pendingDesign.plan.pages.length} 页策划中抽取的三页样稿。当前为 ${esc(DESIGN_DIRECTIONS[pendingDesign.direction].name)}。</p></div>${button('complete-design', busy === 'design' ? '生成与检查中…' : '按此方向生成整套', 'sparkles', disabled(Boolean(busy)), false)}</div><div class="ppt-design-directions">${Object.entries(
      DESIGN_DIRECTIONS,
    )
      .map(
        ([id, value]) =>
          `<button type="button" class="button secondary" data-action="ppt-design-direction" data-direction="${id}" aria-pressed="${pendingDesign.direction === id}" ${disabled(Boolean(busy))}>${esc(value.name)}<small>${esc(value.description)}</small></button>`,
      )
      .join(
        '',
      )}</div><div class="ppt-sample-grid">${pendingDesign.deck.slides.map((slide, i) => `<article>${slideMarkup(slide, pendingDesign.deck.theme, i, 3)}<p>${esc(slide.title)}</p></article>`).join('')}</div></section>`
  }
  function visualReportMarkup() {
    const visualBusy = Boolean(busy) || Boolean(visualJob)
    const controls = `<details class="ppt-visual-actions" data-disclosure-id="ppt-visual-actions"><summary>图片理解与视觉检查</summary><p>将本次作品截图或选中图片发送给设置中的 PPT 视觉模型。视觉修正只调整布局和样式。</p><div class="ppt-inline-actions">${button('inspect-page', '检查当前页', 'scan-eye', disabled(visualBusy))}${button('inspect-deck', '检查整套', 'gallery-vertical-end', disabled(visualBusy || draft.slides.length > 16))}${canvasEditor.selectedNode()?.type === 'image' ? button('describe-image', '理解选中图片', 'image', disabled(visualBusy)) : ''}</div></details>`
    if (!visualReport) return controls
    const stale = visualSignature !== visualRevision(draft)
    const scope =
      visualReport.checkedPageIds?.length === draft.slides.length
        ? `整套 ${draft.slides.length} 页`
        : `第 ${visualReport.checkedPageIds?.map((id) => draft.slides.findIndex((s) => s.id === id) + 1).join('、')} 页`
    const summary = stale
      ? '作品已修改，建议重新检查。'
      : visualReport.status === 'pass'
        ? `已检查${scope}，未发现明显视觉问题。`
        : visualReport.status === 'issues'
          ? `已检查${scope}，仍有 ${visualReport.issues.length} 项需要调整。`
          : visualReport.message
    return `${controls}<div class="ppt-visual-report" role="status"><strong>${esc(summary)}</strong>${visualReport.correctionCount ? `<p>已自动调整 ${visualReport.correctionCount} 个对象，并重新渲染检查。</p>` : ''}${!stale && visualReport.issues?.length ? `<ul>${visualReport.issues.map((issue) => `<li>第 ${draft.slides.findIndex((s) => s.id === issue.pageId) + 1} 页：${esc(issue.message)}</li>`).join('')}</ul>` : ''}</div>`
  }
  function slideMarkup(slide, theme, index, total, interactive = false) {
    const scene = buildSlideScene(slide, theme, index, total)
    const draw = (node, parent = null) => {
      const x = parent ? ((node.x - parent.x) * 100) / parent.w : node.x / 12.8,
        y = parent ? ((node.y - parent.y) * 100) / parent.h : node.y / 7.2,
        w = parent ? (node.w * 100) / parent.w : node.w / 12.8,
        h = parent ? (node.h * 100) / parent.h : node.h / 7.2
      const style = `left:${x}%;top:${y}%;width:${w}%;height:${h}%;`
      const attrs = interactive ? canvasEditor.attributes(node) : ''
      const selected = interactive && canvasEditor.selected(node) ? ' is-selected' : ''
      const handle = interactive ? canvasEditor.resizeHandle(node) : ''
      if (node.type === 'chart')
        return `<div class="ppt-node ppt-chart-node${selected}" style="${style}" ${attrs}>${node.preview.map((child) => draw(child, node)).join('')}${handle}</div>`
      if (node.type === 'image')
        return `<div class="ppt-node ppt-image-node${selected}" style="${style}" ${attrs}><img src="${esc(node.data)}" alt="${esc(node.name || '用户图片')}" style="object-fit:${node.fit}" draggable="false">${handle}</div>`
      if (node.type === 'line')
        return `<svg class="ppt-vector" style="${style}" viewBox="0 0 ${Math.max(1, node.w)} ${Math.max(1, node.h)}" aria-hidden="true"><line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}" stroke="#${node.color}" stroke-width="${node.stroke || 2}"/></svg>`
      return node.type === 'rect' || node.type === 'ellipse'
        ? `<span class="ppt-node ppt-shape${selected}" style="${style}background:#${node.color};${node.type === 'ellipse' ? 'border-radius:50%;' : ''}" ${attrs}>${handle}</span>`
        : `<span class="ppt-node ppt-text${selected}" style="${style}color:#${node.color};font-family:'${node.font}',sans-serif;font-size:${node.size / 12.8}cqw;font-weight:${node.bold ? 700 : 400};text-align:${node.align || 'left'}" ${attrs}>${esc(node.displayText ?? node.text)}${handle}</span>`
    }
    const nodes = scene.nodes
      .filter((node) => !node.hidden)
      .map((node) => draw(node))
      .join('')
    return `<div class="ppt-slide ${interactive && canvasEditor.isActive() ? 'is-editable' : ''}" style="background:#${scene.background}" role="${interactive && canvasEditor.isActive() ? 'group' : 'img'}" aria-label="第 ${index + 1} 页：${esc(slide.title || '未填写标题')}">${nodes}</div>`
  }
  function previewMarkup() {
    if (!draft) return ''
    return slideMarkup(
      draft.slides[selected],
      draft.theme,
      selected,
      draft.slides.length,
      !presenting,
    )
  }
  function pageLabel() {
    const slide = draft.slides[selected]
    return `第 ${selected + 1} 页 · ${PRESENTATION_LAYOUTS[slide.layout]}${slide.seconds ? ` · 建议 ${slide.seconds} 秒` : ''}`
  }
  function issuesMarkup() {
    if (!draft) return ''
    const issues = getPresentationIssues(draft)
    return issues.length
      ? `<div class="ppt-checks" aria-live="polite"><strong>交付检查 · ${issues.length} 项提醒</strong>${issues.map((issue) => `<p>第 ${issue.page} 页 · ${esc(issue.message)}</p>`).join('')}</div>`
      : '<div class="ppt-checks ppt-checks-ok">文字容量检查通过 · 导出后建议检查字体与换行</div>'
  }
  function field(scope, key, label, value, max, multiline = false, hint = '') {
    if (
      scope === 'slide' &&
      key !== 'notes' &&
      draft.slides[selected].canvas &&
      !draft.slides[selected].canvas.some((n) => n.field === key)
    )
      return ''
    const locked =
      scope === 'slide' &&
      (draft.slides[selected].locked ||
        draft.slides[selected].canvas?.some((node) => node.field === key && node.locked))
    const attrs = `id="ppt-${scope}-${key}" data-ppt-scope="${scope}" data-ppt-field="${key}" maxlength="${max}" ${disabled(Boolean(busy) || locked)}`
    return `<label class="ppt-field" for="ppt-${scope}-${key}"><span>${esc(label)}</span>${multiline ? `<textarea ${attrs} rows="${key === 'notes' || key === 'material' ? 5 : 3}">${esc(value)}</textarea>` : `<input ${attrs} value="${esc(value)}" autocomplete="off">`}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`
  }
  function strategyMarkup() {
    if (!draft?.strategy) return ''
    const strategy = draft.strategy
    return `<details class="ppt-strategy"><summary>制作依据与待补充信息</summary><p>${esc(strategy.thesis)}</p>${strategy.requirements.length ? `<strong>本次要求</strong><ul>${strategy.requirements.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${strategy.missing.length ? `<strong>需要补充的事实或证据</strong><ul>${strategy.missing.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}</details>`
  }
  function conversationMarkup() {
    const profile = activeAiProfile()
    return `<section class="ppt-conversation" aria-label="PPT 对话" aria-busy="${busy === 'chatting'}">
      ${draft ? '<div class="ppt-chat-heading"><strong>一起完善这份 PPT</strong><span>直接说你想怎么改</span></div>' : ''}
      ${messages.length ? `<div class="ppt-chat-log" role="log" aria-label="创作对话" aria-live="polite" data-scroll-preserve="ppt-chat">${messages.map((message) => `<article class="ppt-message ppt-message-${message.role}"><strong>${message.role === 'user' ? '你' : 'PPT 助手'}</strong><p>${esc(message.content)}</p></article>`).join('')}</div>` : ''}
      ${busy === 'chatting' ? `<p class="ppt-chat-status" role="status"><i data-lucide="ellipsis"></i>${draft ? '正在修改作品…' : '正在理解材料、组织内容…'}</p>` : ''}
      <div class="ppt-composer">
        <label for="ppt-message">${draft ? '继续描述修改要求' : '告诉我你想做什么 PPT'}</label>
        <textarea id="ppt-message" data-ppt-scope="chat" data-ppt-field="message" rows="${draft ? 4 : 5}" maxlength="12000" aria-describedby="ppt-chat-hint" placeholder="${draft ? '例如：第三页改成方案对比，保留原来的数据。' : '粘贴项目材料、会议记录，或说说你的想法。\n例如：根据这些材料做一份客户提案，介绍我们的方案，控制在 8 分钟内。'}" ${disabled(Boolean(busy))}>${esc(composer)}</textarea>
        <div class="ppt-composer-footer"><span>${draft ? `当前第 ${selected + 1} 页 · Ctrl / ⌘ + Enter 发送` : 'Ctrl / ⌘ + Enter 发送 · Enter 换行'}</span>${button('send', busy === 'chatting' ? '处理中…' : '发送', 'arrow-up', disabled(Boolean(busy) || !profile || !composer.trim()), false)}</div>
      </div>
      <p class="ppt-chat-hint" id="ppt-chat-hint">${profile ? `使用 ${esc(profile.label)} · 发送本次对话${draft ? '与当前作品' : ''}，不读取资料库。` : '先配置一个模型，即可通过对话制作 PPT。'}</p>
      ${!profile ? '<button type="button" class="button secondary" data-page-jump="ai">配置模型</button>' : ''}
      ${error && !draft ? `<div class="ppt-error" role="alert">${esc(error)}</div>` : ''}
    </section>`
  }
  function landingMarkup() {
    return `<section class="ppt-start">
      <div class="ppt-start-heading"><h2>这次，要做什么演示？</h2><p>把材料放在这里，或直接说说你的目标。</p></div>
      <div class="ppt-start-main">${conversationMarkup()}
        <div class="ppt-start-footer"><div class="ppt-starters" aria-label="创作起点"><span>试着开始</span>${[
          ['proposal', '客户提案'],
          ['report', '工作汇报'],
          ['pitch', '比赛路演'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" data-action="ppt-starter" data-starter="${id}" ${disabled(Boolean(busy))}>${label}<i data-lucide="arrow-up-right"></i></button>`,
          )
          .join(
            '',
          )}</div>${button('manual', '从空白作品开始', 'plus', disabled(Boolean(busy)))}</div>
      </div>
    </section>`
  }
  function galleryMarkup() {
    return `<section class="ppt-gallery" aria-label="本地作品"><div class="ppt-section-heading"><div><h2>最近作品</h2></div><span>${projects().length} 份作品</span></div>${
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
  function contentPanelMarkup() {
    const slide = draft.slides[selected]
    return `<section class="ppt-inspector" aria-label="页面内容与设计" data-scroll-preserve="ppt-inspector"><div class="ppt-inspector-heading"><strong>页面内容 · 第 ${selected + 1} 页</strong><span>修改文字、设计与演讲备注</span></div>
          ${field('deck', 'title', '作品名称', draft.title, 100)}
          ${draft.slides.some((page) => page.canvas) ? `<div class="ppt-field"><span>设计方向</span><strong>${esc(DESIGN_DIRECTIONS[draft.designDirection]?.name || '自由对象设计')}</strong><small>在直接编辑中调整对象颜色与布局。</small></div>` : `<label class="ppt-field"><span>视觉主题</span><select data-ppt-scope="deck" data-ppt-field="theme" ${disabled(Boolean(busy))}>${options(Object.fromEntries(Object.entries(PRESENTATION_THEMES).map(([id, theme]) => [id, theme.name])), draft.theme)}</select><small data-ppt-theme-description>${esc(PRESENTATION_THEMES[draft.theme].description)}</small></label>`}
          ${!slide.canvas ? `<label class="ppt-field"><span>页面版式</span><select data-ppt-scope="slide" data-ppt-field="layout" ${disabled(Boolean(busy) || slide.locked)}>${options(PRESENTATION_LAYOUTS, slide.layout)}</select></label>` : ''}
          ${field('slide', 'eyebrow', '页眉', slide.eyebrow, 60)}
          ${field('slide', 'title', '页面标题', slide.title, 100, true)}
          ${field('slide', 'body', '正文', slide.body, 1200, true)}
          ${field('slide', 'points', '要点（每行一项，最多 6 项）', slide.points.join('\n'), 965, true, '每个要点最多 160 字。')}
          ${field('slide', 'notes', '当前页演讲备注', slide.notes, 4000, true)}
          <div class="ppt-page-actions">${iconButton('move-up', '向前移动页面', 'arrow-up', disabled(selected === 0 || Boolean(busy)))}${iconButton('move-down', '向后移动页面', 'arrow-down', disabled(selected === draft.slides.length - 1 || Boolean(busy)))}${button('duplicate', '复制页面', 'copy', disabled(Boolean(busy) || draft.slides.length >= 40))}${iconButton('remove-slide', '删除当前页面', 'trash-2', disabled(draft.slides.length <= 1 || Boolean(busy)))}</div>
        </section>`
  }
  function editorMarkup() {
    return `<section class="ppt-editor" aria-label="PPT 编辑器" aria-busy="${Boolean(busy)}">
      <div class="ppt-editor-bar"><div class="ppt-editor-identity">${iconButton('home', '返回作品', 'arrow-left', disabled(Boolean(busy)))}<div><strong data-ppt-project-title>${esc(draft.title)}</strong><span data-ppt-save-state>${dirty() ? '有未保存的修改' : '已保存到本机'} · ${draft.slides.length} 页</span></div></div><div class="ppt-inline-actions"><div class="ppt-history-tools">${iconButton('undo', '撤销修改', 'undo-2', disabled(!history.length || Boolean(busy)))}${iconButton('redo', '重做修改', 'redo-2', disabled(!future.length || Boolean(busy)))}</div>${button('save', busy === 'saving' ? '保存中…' : '保存作品', 'save', disabled(Boolean(busy)))}${button('present', '演示', 'play', disabled(Boolean(busy)))}${button('export', busy === 'exporting' ? '导出中…' : '导出 PPTX', 'download', disabled(Boolean(busy)), false)}</div></div>
      ${error ? `<div class="ppt-error" role="alert">${esc(error)}</div>` : ''}
      <div class="ppt-workspace">
        <aside class="ppt-filmstrip" aria-label="幻灯片列表" data-scroll-preserve="ppt-pages"><div class="ppt-filmstrip-head"><span>页面 <b>${draft.slides.length}</b></span>${iconButton('add-slide', '添加页面', 'plus', disabled(Boolean(busy) || draft.slides.length >= 40))}</div>${draft.slides.map((item, i) => `<button class="ppt-thumbnail ${selected === i ? 'is-selected' : ''}" data-action="ppt-select" data-index="${i}" aria-label="选择第 ${i + 1} 页" aria-pressed="${selected === i}" ${disabled(Boolean(busy))}><div class="ppt-thumbnail-art" data-ppt-thumb="${i}">${slideMarkup(item, draft.theme, i, draft.slides.length)}</div><span><b>${String(i + 1).padStart(2, '0')}</b><span data-ppt-thumb-title="${i}">${esc(item.title || '未填写标题')}</span></span></button>`).join('')}</aside>
        <div class="ppt-canvas-area"><div class="ppt-canvas-toolbar" role="toolbar" aria-label="画布工具">${canvasEditor.toolbarMarkup(Boolean(busy))}${button('canvas-mode', canvasEditor.isActive() ? '完成直接编辑' : '直接编辑', 'mouse-pointer-2', disabled(Boolean(busy)))}</div><div class="ppt-canvas-surface"><div class="ppt-stage-meta"><span data-ppt-page-label>${esc(pageLabel())}</span><span>16 : 9</span></div><div class="ppt-stage" data-ppt-preview tabindex="0" aria-label="幻灯片画布">${previewMarkup()}</div><div class="ppt-canvas-footer"><span>${canvasEditor.isActive() ? '拖动移动 · 右下角缩放 · 方向键微调' : '选择页面，预览你的演示'}</span><div class="ppt-page-navigation">${iconButton('previous', '上一页', 'chevron-left', disabled(selected === 0 || Boolean(busy)))}<span>${selected + 1} / ${draft.slides.length}</span>${iconButton('next', '下一页', 'chevron-right', disabled(selected === draft.slides.length - 1 || Boolean(busy)))}</div></div></div><div class="ppt-delivery-area"><div data-ppt-checks>${issuesMarkup()}</div>${visualReportMarkup()}${strategyMarkup()}</div></div>
        <aside class="ppt-editor-side" aria-label="编辑侧栏"><nav class="ppt-side-tabs" aria-label="编辑面板">${[
          ['chat', '对话助手'],
          ['content', '手动编辑'],
          ['objects', '对象属性'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" data-action="ppt-panel" data-panel="${id}" aria-pressed="${inspectorPanel === id}" ${disabled(Boolean(busy))}>${label}</button>`,
          )
          .join(
            '',
          )}</nav><div class="ppt-side-body" data-scroll-preserve="ppt-side-body">${inspectorPanel === 'content' ? contentPanelMarkup() : inspectorPanel === 'objects' ? canvasEditor.markup() : conversationMarkup()}</div>${canvasEditor.isActive() ? `<div class="ppt-side-footer">${button('canvas-chat', inspectorPanel === 'chat' ? '返回画布编辑' : '对话修改所选对象', 'message-square', disabled(Boolean(busy)))}</div>` : ''}</aside>
      </div>
    </section>`
  }
  function presentationMarkup() {
    return `<section class="ppt-presentation" aria-label="演示预览"><div class="ppt-section-heading"><strong>${esc(draft.title)}</strong>${button('stop-presenting', '退出演示', 'x')}</div><div class="ppt-stage">${previewMarkup()}</div><div class="ppt-presentation-controls">${button('previous', '上一页', 'chevron-left', disabled(selected === 0))}<span>${selected + 1} / ${draft.slides.length}</span>${button('next', '下一页', 'chevron-right', disabled(selected === draft.slides.length - 1))}</div><p class="ppt-presentation-notes">${esc(draft.slides[selected].notes || '使用左右方向键切换，Esc 返回编辑器。')}</p></section>`
  }
  function renderPage() {
    if (!draft?.slides[selected]?.canvas) canvasEditor.reset()
    reportDirty()
    return `<div class="ppt-studio ${draft ? 'has-draft' : 'is-home'}">${presenting && draft ? presentationMarkup() : draft ? editorMarkup() : `${landingMarkup()}${designSamplesMarkup()}${projects().length ? galleryMarkup() : ''}`}</div>`
  }
  function refreshPreview() {
    if (visualReport && visualSignature !== visualRevision(draft)) {
      const report = document.querySelector('.ppt-visual-report')
      const summary = report?.querySelector('strong')
      if (summary) summary.textContent = '作品已修改，建议重新检查。'
      const list = report?.querySelector('ul')
      if (list) list.hidden = true
    }
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
    if (label) label.textContent = pageLabel()
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
    if (!busy && canvasEditor.handleInput(element)) return true
    const key = element.dataset?.pptField
    if (!key) return false
    if (busy) return true
    const scope = element.dataset.pptScope
    if (scope === 'chat') {
      composer = element.value
      const send = document.querySelector('[data-action="ppt-send"]')
      if (send) send.disabled = !composer.trim() || !activeAiProfile()
      return true
    }
    if (!draft) return true
    if (scope === 'slide' && draft.slides[selected].locked) return true
    if (
      scope === 'slide' &&
      draft.slides[selected].canvas?.some((n) => n.field === key && n.locked)
    )
      return true
    const nextKey = `${scope}:${selected}:${key}`
    if (editKey !== nextKey) {
      checkpoint()
      editKey = nextKey
    }
    const target = scope === 'deck' ? draft : draft.slides[selected]
    target[key] = key === 'points' ? element.value.split('\n') : element.value
    if (scope === 'slide' && target.canvas)
      for (const node of target.canvas) if (node.field === key) node.text = element.value
    refreshPreview()
    return true
  }
  async function handleAction(action, element) {
    if (!action.startsWith('ppt-')) return false
    if (busy) return true
    if (action === 'ppt-starter') {
      const starters = {
        proposal:
          '我想做一份客户提案。请先和我确认客户需求、方案价值与展示目标，再根据我补充的真实材料制作。',
        report:
          '我想做一份工作汇报。请根据我接下来提供的进展、数据和问题，帮我组织重点与下一步计划。',
        pitch: '我想做一份比赛路演 PPT。请先确认比赛要求、项目情况与展示时长，再根据真实材料策划。',
      }
      if (!Object.hasOwn(starters, element.dataset.starter)) return true
      if (composer.trim()) {
        toast('输入框已有材料，已为你保留。清空后可以选择新的创作起点。')
        document.querySelector('#ppt-message')?.focus()
        return true
      }
      composer = starters[element.dataset.starter]
      render()
      document.querySelector('#ppt-message')?.focus()
      return true
    }
    if (action === 'ppt-complete-design') {
      await completeDesign()
      return true
    }
    if (action === 'ppt-design-direction' && pendingDesign) {
      if (!Object.hasOwn(DESIGN_DIRECTIONS, element.dataset.direction)) return true
      pendingDesign.direction = element.dataset.direction
      pendingDesign.deck = materializeDesign(pendingDesign.deck, pendingDesign.direction, {
        replace: true,
      })
      render()
      return true
    }
    if (action === 'ppt-inspect-page' || action === 'ppt-inspect-deck') {
      void inspectInBackground(action === 'ppt-inspect-page' ? draft.slides[selected].id : null)
      return true
    }
    if (action === 'ppt-describe-image') {
      const snapshot = copy(draft)
      busy = 'visual'
      error = ''
      render()
      try {
        if (action === 'ppt-describe-image') {
          const result = await api.describePresentationImage({
            deck: snapshot,
            pageId: snapshot.slides[selected].id,
            objectId: canvasEditor.selectedId(),
          })
          messages.push({
            role: 'assistant',
            content: `图片理解（${result.model}）：${result.message}`,
          })
          inspectorPanel = 'chat'
        } else {
          const result = await api.inspectPresentation({
            deck: snapshot,
            ...(action === 'ppt-inspect-page' ? { pageId: snapshot.slides[selected].id } : {}),
          })
          checkpoint()
          draft = copy(result.deck)
          visualReport = result.report
          visualSignature = visualRevision(draft)
        }
      } catch (err) {
        error = `视觉任务失败：${err.message}。原稿已保留。`
      } finally {
        busy = ''
        reportDirty()
        render()
      }
      return true
    }
    if (action === 'ppt-canvas-image' || action === 'ppt-canvas-replace-image') {
      const original = canvasEditor.selectedNode()
      busy = 'image'
      error = ''
      render()
      try {
        const image = await api.choosePresentationImage()
        if (!image.canceled) {
          if (
            action === 'ppt-canvas-replace-image' &&
            original?.type === 'image' &&
            !original.locked &&
            !draft.slides[selected].locked
          ) {
            checkpoint()
            original.data = image.data
            original.name = image.name
          } else
            canvasEditor.addObject({
              type: 'image',
              ...image,
              x: 160,
              y: 220,
              w: 600,
              h: 340,
              fit: 'contain',
            })
        }
      } catch (err) {
        error = `图片导入失败：${err.message}`
      } finally {
        busy = ''
        render()
      }
      return true
    }
    if (action === 'ppt-panel') {
      const next = element.dataset.panel
      if (!['chat', 'content', 'objects'].includes(next)) return true
      if (next === 'objects' && !canvasEditor.isActive()) {
        canvasEditor.handleAction('ppt-canvas-mode', element)
      }
      inspectorPanel = next
      render()
      return true
    }
    if (action === 'ppt-canvas-chat') {
      inspectorPanel = inspectorPanel === 'chat' ? 'objects' : 'chat'
      render()
      return true
    }
    if (action === 'ppt-canvas-select' && inspectorPanel !== 'objects') {
      inspectorPanel = 'objects'
      canvasEditor.handleAction(action, element)
      render()
      return true
    }
    if (canvasEditor.handleAction(action, element)) return true
    editKey = ''
    const command = action.slice(4)
    if (['select', 'previous', 'next'].includes(command)) {
      canvasEditor.reset()
      if (inspectorPanel === 'objects') inspectorPanel = 'chat'
    }
    if (command === 'manual') {
      if (!(await canReplace(element))) return true
      setDraft(createPresentation())
      inspectorPanel = 'content'
    } else if (command === 'send') {
      await sendMessage()
      return true
    } else if (command === 'toggle-manual') {
      inspectorPanel = inspectorPanel === 'content' ? 'chat' : 'content'
    } else if (command === 'home') {
      if (!(await canReplace(element))) return true
      canvasEditor.reset()
      draft = null
      pendingDesign = null
      messages = []
      composer = ''
      inspectorPanel = 'chat'
      error = ''
    } else if (command === 'open') {
      if (!(await canReplace(element))) return true
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
    if (busy || document.querySelector('#dialogRoot [role="dialog"]')) return
    if (
      event.target?.id === 'ppt-message' &&
      event.key === 'Enter' &&
      (event.ctrlKey || event.metaKey) &&
      !event.isComposing
    ) {
      event.preventDefault()
      void sendMessage()
      return
    }
    if (!draft) return
    if (!presenting && canvasEditor.handleKeydown(event)) {
      event.preventDefault()
      return
    }
    if (
      !presenting &&
      (event.ctrlKey || event.metaKey) &&
      ['z', 'y'].includes(event.key.toLowerCase()) &&
      !event.target.matches?.('input,textarea,select,[contenteditable="true"]')
    ) {
      event.preventDefault()
      void handleAction(
        event.key.toLowerCase() === 'y' || event.shiftKey ? 'ppt-redo' : 'ppt-undo',
        {},
      )
      return
    }
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
  function handlePointer(event) {
    if (!busy && !presenting) canvasEditor.handlePointer(event)
  }
  return { renderPage, handleAction, handleInput, handleKeydown, handlePointer }
}
