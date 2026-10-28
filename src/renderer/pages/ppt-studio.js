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
  let manualOpen = false
  let composer = ''
  let messages = []
  let reportedDirty = false
  let canvasChatOpen = false
  const canvasEditor = createPptCanvasEditor({
    getDeck: () => draft,
    getIndex: () => selected,
    checkpoint,
    render,
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
    canvasEditor.reset()
    canvasChatOpen = false
    draft = copy(value)
    saved = isSaved ? signature(draft) : ''
    selected = 0
    history = []
    future = []
    editKey = ''
    messages = []
    composer = ''
    error = ''
    manualOpen = false
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
    if (!dirty()) return true
    const choice = await openSaveChangesDialog({ returnFocus: source })
    if (choice === 'save') return save()
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
      const result = await api.chatPresentation({
        message,
        history: context,
        deck: current,
        selectedSlideId: current?.slides[selected]?.id || null,
        selectedObjectId: canvasEditor.selectedId(),
      })
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
        : `<span class="ppt-node ppt-text${selected}" style="${style}color:#${node.color};font-family:'${node.font}',sans-serif;font-size:${node.size / 12.8}cqw;font-weight:${node.bold ? 700 : 400};text-align:${node.align || 'left'}" ${attrs}>${esc(node.text)}${handle}</span>`
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
    const attrs = `id="ppt-${scope}-${key}" data-ppt-scope="${scope}" data-ppt-field="${key}" maxlength="${max}" ${disabled(Boolean(busy))}`
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
        <textarea id="ppt-message" data-ppt-scope="chat" data-ppt-field="message" rows="${draft ? 4 : 7}" maxlength="12000" aria-describedby="ppt-chat-hint" placeholder="${draft ? '例如：第三页改成方案对比，保留原来的数据。' : '粘贴比赛通知、项目材料或你的想法。\n例如：按这份通知帮我做一份参赛 PPT，我是机械专业大二学生，方向是智能制造。'}" ${disabled(Boolean(busy))}>${esc(composer)}</textarea>
        <div class="ppt-composer-footer"><span>${draft ? `当前第 ${selected + 1} 页 · Ctrl / ⌘ + Enter 发送` : 'Ctrl / ⌘ + Enter 发送 · Enter 换行'}</span>${button('send', busy === 'chatting' ? '处理中…' : '发送', 'arrow-up', disabled(Boolean(busy) || !profile || !composer.trim()), false)}</div>
      </div>
      <p class="ppt-chat-hint" id="ppt-chat-hint">${profile ? `使用 ${esc(profile.label)} · 发送本次对话${draft ? '与当前作品' : ''}，不读取资料库。` : '先配置一个模型，即可通过对话制作 PPT。'}</p>
      ${!profile ? '<button type="button" class="button secondary" data-page-jump="ai">配置模型</button>' : ''}
      ${error ? `<div class="ppt-error" role="alert">${esc(error)}</div>` : ''}
    </section>`
  }
  function landingMarkup() {
    return `<section class="ppt-start"><div class="ppt-start-heading"><span class="ppt-kicker">PPT 工作室</span><h2>把材料交给我，一起做成 PPT。</h2><p>直接粘贴通知、材料或想法。结构与排版交给我，缺少关键信息时再补充。</p></div>${conversationMarkup()}<div class="ppt-start-footer">${button('manual', '从空白作品开始', 'pen-line', disabled(Boolean(busy)))}</div></section>`
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
      <div class="ppt-editor-bar"><div class="ppt-editor-identity">${iconButton('home', '返回作品', 'arrow-left', disabled(Boolean(busy)))}<div><strong data-ppt-project-title>${esc(draft.title)}</strong><span data-ppt-save-state>${dirty() ? '有未保存的修改' : '已保存到本机'} · ${draft.slides.length} 页</span></div></div><div class="ppt-inline-actions">${iconButton('undo', '撤销修改', 'undo-2', disabled(!history.length || Boolean(busy)))}${iconButton('redo', '重做修改', 'redo-2', disabled(!future.length || Boolean(busy)))}${button('toggle-manual', manualOpen ? '收起编辑' : '手动编辑', 'sliders-horizontal', `${disabled(Boolean(busy))} aria-expanded="${manualOpen}"`)}${button('save', busy === 'saving' ? '保存中…' : '保存作品', 'save', disabled(Boolean(busy)))}${button('export', busy === 'exporting' ? '导出中…' : '导出 PPTX', 'download', disabled(Boolean(busy)), false)}</div></div>
      <div class="ppt-workspace ${canvasEditor.isActive() && !canvasChatOpen ? 'is-canvas-focused' : ''}">${conversationMarkup()}<div class="ppt-result"><div class="ppt-editor-grid">
        <aside class="ppt-filmstrip" aria-label="幻灯片列表" data-scroll-preserve="ppt-pages"><div class="ppt-filmstrip-head"><span>页面</span>${iconButton('add-slide', '添加页面', 'plus', disabled(Boolean(busy) || draft.slides.length >= 40))}</div>${draft.slides.map((item, i) => `<button class="ppt-thumbnail ${selected === i ? 'is-selected' : ''}" data-action="ppt-select" data-index="${i}" aria-label="选择第 ${i + 1} 页" aria-pressed="${selected === i}" ${disabled(Boolean(busy))}><div class="ppt-thumbnail-art" data-ppt-thumb="${i}">${slideMarkup(item, draft.theme, i, draft.slides.length)}</div><span><b>${String(i + 1).padStart(2, '0')}</b><span data-ppt-thumb-title="${i}">${esc(item.title || '未填写标题')}</span></span></button>`).join('')}</aside>
        <div class="ppt-stage-column"><div class="ppt-stage-meta"><span data-ppt-page-label>${esc(pageLabel())}</span><span>16 : 9</span></div><div class="ppt-stage" data-ppt-preview tabindex="0" aria-label="幻灯片画布">${previewMarkup()}</div><div class="ppt-page-actions">${button('canvas-mode', canvasEditor.isActive() ? '完成直接编辑' : '直接编辑', 'mouse-pointer-2', disabled(Boolean(busy)))}${canvasEditor.isActive() ? button('canvas-chat', canvasChatOpen ? '返回画布编辑' : '对话修改所选对象', 'message-square', disabled(Boolean(busy))) : ''}${iconButton('previous', '上一页', 'chevron-left', disabled(selected === 0 || Boolean(busy)))}${button('present', '演示', 'play', disabled(Boolean(busy)))}${iconButton('next', '下一页', 'chevron-right', disabled(selected === draft.slides.length - 1 || Boolean(busy)))}</div><div data-ppt-checks>${issuesMarkup()}</div></div>
      </div>${
        manualOpen
          ? `<aside class="ppt-inspector" aria-label="页面内容与设计" data-scroll-preserve="ppt-inspector"><div class="ppt-inspector-heading"><strong>手动编辑 · 第 ${selected + 1} 页</strong><span>也可以直接在对话中提出修改</span></div>
          ${field('deck', 'title', '作品名称', draft.title, 100)}
          <label class="ppt-field"><span>视觉主题</span><select data-ppt-scope="deck" data-ppt-field="theme" ${disabled(Boolean(busy))}>${options(Object.fromEntries(Object.entries(PRESENTATION_THEMES).map(([id, theme]) => [id, theme.name])), draft.theme)}</select><small data-ppt-theme-description>${esc(PRESENTATION_THEMES[draft.theme].description)}</small></label>
          <label class="ppt-field"><span>页面版式</span><select data-ppt-scope="slide" data-ppt-field="layout" ${disabled(Boolean(busy))}>${options(PRESENTATION_LAYOUTS, slide.layout)}</select></label>
          ${field('slide', 'eyebrow', '页眉', slide.eyebrow, 60)}
          ${field('slide', 'title', '页面标题', slide.title, 100, true)}
          ${field('slide', 'body', '正文', slide.body, 1200, true)}
          ${field('slide', 'points', '要点（每行一项，最多 6 项）', slide.points.join('\n'), 965, true, '每个要点最多 160 字。')}
          ${field('slide', 'notes', '当前页演讲备注', slide.notes, 4000, true)}
          <div class="ppt-page-actions">${iconButton('move-up', '向前移动页面', 'arrow-up', disabled(selected === 0 || Boolean(busy)))}${iconButton('move-down', '向后移动页面', 'arrow-down', disabled(selected === draft.slides.length - 1 || Boolean(busy)))}${button('duplicate', '复制页面', 'copy', disabled(Boolean(busy) || draft.slides.length >= 40))}${iconButton('remove-slide', '删除当前页面', 'trash-2', disabled(draft.slides.length <= 1 || Boolean(busy)))}</div>
        </aside>`
          : ''
      }
      ${canvasEditor.markup()}${strategyMarkup()}</div></div>
    </section>`
  }
  function presentationMarkup() {
    return `<section class="ppt-presentation" aria-label="演示预览"><div class="ppt-section-heading"><strong>${esc(draft.title)}</strong>${button('stop-presenting', '退出演示', 'x')}</div><div class="ppt-stage">${previewMarkup()}</div><div class="ppt-presentation-controls">${button('previous', '上一页', 'chevron-left', disabled(selected === 0))}<span>${selected + 1} / ${draft.slides.length}</span>${button('next', '下一页', 'chevron-right', disabled(selected === draft.slides.length - 1))}</div><p class="ppt-presentation-notes">${esc(draft.slides[selected].notes || '使用左右方向键切换，Esc 返回编辑器。')}</p></section>`
  }
  function renderPage() {
    if (!draft?.slides[selected]?.canvas) canvasEditor.reset()
    reportDirty()
    return `<div class="ppt-studio">${presenting && draft ? presentationMarkup() : draft ? editorMarkup() : `${landingMarkup()}${projects().length ? galleryMarkup() : ''}`}</div>`
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
    if (action === 'ppt-canvas-chat') {
      canvasChatOpen = !canvasChatOpen
      render()
      return true
    }
    if (canvasEditor.handleAction(action, element)) return true
    editKey = ''
    const command = action.slice(4)
    if (['select', 'previous', 'next'].includes(command)) {
      canvasEditor.reset()
      canvasChatOpen = false
    }
    if (command === 'manual') {
      if (!(await canReplace(element))) return true
      setDraft(createPresentation())
      manualOpen = true
    } else if (command === 'send') {
      await sendMessage()
      return true
    } else if (command === 'toggle-manual') {
      manualOpen = !manualOpen
    } else if (command === 'home') {
      if (!(await canReplace(element))) return true
      canvasEditor.reset()
      canvasChatOpen = false
      draft = null
      messages = []
      composer = ''
      manualOpen = false
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
