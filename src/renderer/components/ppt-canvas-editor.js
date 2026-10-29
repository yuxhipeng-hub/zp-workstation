import { buildSlideScene, PRESENTATION_THEMES, presentationId } from '../../shared/presentation.mjs'
import { canvasFromScene } from '../../shared/presentation-canvas.mjs'

/** 对象交互只操作草稿；持久化、模型与图片选择均由页面注入。 */
export function createPptCanvasEditor({
  getDeck,
  getIndex,
  checkpoint,
  render,
  refresh,
  reportDirty,
  escapeHtml: esc,
  toast,
}) {
  let active = false
  let selectedId = null
  let visibleSelectionId = null
  let drag = null
  let editKey = ''
  const slide = () => getDeck()?.slides[getIndex()]
  const node = () => slide()?.canvas?.find((item) => item.id === selectedId)
  const readonly = () => Boolean(slide()?.locked || node()?.locked)
  const disabled = (value) => (value ? 'disabled' : '')
  const name = (item) =>
    item.name ||
    (item.type === 'text'
      ? item.text.slice(0, 24) || '空文字'
      : { rect: '矩形色块', ellipse: '圆形', chart: '图表', image: '图片' }[item.type])
  function reset() {
    active = false
    selectedId = null
    visibleSelectionId = null
    drag = null
    editKey = ''
  }
  function ensure() {
    if (!Array.isArray(slide().canvas)) {
      checkpoint()
      slide().canvas = canvasFromScene(
        buildSlideScene(slide(), getDeck().theme, getIndex(), getDeck().slides.length),
        slide(),
      )
      slide().background = PRESENTATION_THEMES[getDeck().theme].bg
    }
    active = true
  }
  function addObject(object) {
    ensure()
    if (slide().locked) return toast('页面已锁定，请先解锁。')
    if (slide().canvas.length >= 120) return toast('每页最多 120 个对象。')
    checkpoint()
    const item = {
      id: presentationId(),
      x: 160,
      y: 260,
      w: 520,
      h: 100,
      locked: false,
      hidden: false,
      ...object,
    }
    slide().canvas.push(item)
    selectedId = item.id
    render()
  }
  function button(action, label, extra = '', icon = '', compact = false) {
    const hint = action === 'add-rect' ? '添加矩形色块：用作底色、强调条或区域分隔' : label
    return `<button type="button" class="${compact ? 'ppt-icon-button' : 'ppt-tool-button'}" data-action="ppt-canvas-${action}" title="${esc(hint)}" aria-label="${esc(label)}" ${extra}>${icon ? `<i data-lucide="${icon}"></i>` : ''}${compact ? '' : `<span>${esc(label)}</span>`}</button>`
  }
  function toolbarMarkup(busy = false) {
    const locked = busy || slide()?.locked
    return `<div class="ppt-insert-tools" role="group" aria-label="插入元素">${button('add-text', '文字', disabled(locked), 'type')}${button('add-rect', '色块', `${disabled(locked)} aria-describedby="ppt-shape-purpose"`, 'square')}${button('image', '图片', disabled(locked), 'image')}<span class="ppt-toolbar-divider" aria-hidden="true"></span>${button('page-lock', slide()?.locked ? '解锁页面' : '锁定页面', disabled(busy), slide()?.locked ? 'lock-keyhole' : 'lock-keyhole-open', true)}<span class="sr-only" id="ppt-shape-purpose">添加矩形色块，用作底色、强调条或区域分隔。</span></div>`
  }
  function field(key, label, value, type = 'number', attrs = '') {
    return `<label class="ppt-object-field"><span>${esc(label)}</span><input type="${type}" aria-label="${esc(label)}" data-canvas-prop="${key}" value="${esc(value)}" ${attrs} ${disabled(readonly())}></label>`
  }
  function markup() {
    if (!active || !slide()?.canvas) return ''
    const item = node()
    visibleSelectionId = selectedId
    return `<section class="ppt-object-editor" aria-label="对象编辑">
      ${
        item
          ? `<div class="ppt-object-properties"><header class="ppt-object-heading"><div><span>${esc({ text: '文字', rect: '形状', ellipse: '形状', image: '图片', chart: '图表' }[item.type])}</span><strong>${esc(name(item))}</strong></div><div class="ppt-object-quick-actions" role="group" aria-label="对象操作">${button('lock', item.locked ? '解锁对象' : '锁定对象', `${disabled(slide().locked)} aria-pressed="${Boolean(item.locked)}"`, item.locked ? 'lock-keyhole' : 'lock-keyhole-open', true)}${button('duplicate', '复制对象', disabled(slide().locked), 'copy', true)}${button('delete', '删除对象', disabled(readonly()), 'trash-2', true)}</div></header>
      ${item.type === 'text' ? `<label class="ppt-object-text"><span>对象文字</span><textarea aria-label="对象文字" data-canvas-prop="text" maxlength="${{ title: 100, body: 1200, eyebrow: 60 }[item.field] || 4000}" rows="4" ${disabled(readonly())}>${esc(item.text)}</textarea></label><div class="ppt-object-style">${field('size', '字号', item.size, 'number', 'min="8" max="160"')}${field('color', '颜色', `#${item.color}`, 'color')}</div><div class="ppt-format-controls" role="group" aria-label="文字格式">${button('bold', item.bold ? '取消加粗' : '加粗', `${disabled(readonly())} aria-pressed="${Boolean(item.bold)}"`, 'bold', true)}<span class="ppt-toolbar-divider" aria-hidden="true"></span>${['left', 'center', 'right'].map((align, i) => button(`align-${align}`, ['左对齐', '居中', '右对齐'][i], `${disabled(readonly())} aria-pressed="${item.align === align}"`, `align-${align}`, true)).join('')}</div>` : ''}
      ${['rect', 'ellipse'].includes(item.type) ? `${field('color', '填充颜色', `#${item.color}`, 'color')}<p class="ppt-object-hint">色块可用作底色、强调条或区域分隔。拖动调整位置，右下角调整大小。</p>` : ''}
      ${item.type === 'image' ? `<div class="ppt-image-fit" role="group" aria-label="图片显示方式">${button('contain', '完整显示', `${disabled(readonly())} aria-pressed="${item.fit !== 'cover'}"`, 'scan')}${button('cover', '填满裁切', `${disabled(readonly())} aria-pressed="${item.fit === 'cover'}"`, 'crop')}${button('replace-image', '替换图片', disabled(readonly()), 'image-up')}</div>` : ''}
      ${item.type === 'chart' ? `<details class="ppt-chart-data"><summary>编辑图表数据</summary><div class="ppt-chart-table"><table><thead><tr><th>分类</th>${item.chart.series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${item.chart.categories.map((category, i) => `<tr><td><input aria-label="第 ${i + 1} 项分类" data-canvas-chart="categories.${i}" value="${esc(category)}" maxlength="24" ${disabled(readonly())}></td>${item.chart.series.map((s, si) => `<td><input aria-label="${esc(s.name)} 第 ${i + 1} 项数值" type="number" step="any" data-canvas-chart="series.${si}.values.${i}" value="${s.values[i]}" ${disabled(readonly())}></td>`).join('')}</tr>`).join('')}</tbody></table></div>${field('chart.source', '数据来源', item.chart.source, 'text', 'maxlength="200"')}${field('chart.unit', '单位', item.chart.unit, 'text', 'maxlength="24"')}</details>` : ''}
      <details class="ppt-object-arrange" data-disclosure-id="ppt-object-arrange"><summary>排列与显示</summary><div class="ppt-arrange-controls">${button('front', '上移图层', disabled(readonly()), 'bring-to-front')}${button('back', '下移图层', disabled(readonly()), 'send-to-back')}${button('hide', item.hidden ? '显示对象' : '隐藏对象', disabled(readonly()), item.hidden ? 'eye' : 'eye-off')}</div></details>
      <details data-disclosure-id="ppt-object-geometry"><summary>精确位置与大小</summary><div class="ppt-object-geometry">${['x', 'y', 'w', 'h'].map((key, i) => field(key, ['水平位置', '垂直位置', '宽度', '高度'][i], Number(item[key].toFixed(1)), 'number', 'step="1"')).join('')}</div></details></div>`
          : '<div class="ppt-object-empty"><i data-lucide="mouse-pointer-2"></i><strong>选择一个对象</strong><p>点击画布上的文字、图形或图片，在这里调整。</p><span>拖动移动 · 方向键微调</span></div>'
      }
      <details class="ppt-layer-list" data-disclosure-id="ppt-object-layers"><summary>对象与图层 · ${slide().canvas.length}</summary>${[
        ...slide().canvas,
      ]
        .reverse()
        .map(
          (object) =>
            `<button type="button" data-action="ppt-canvas-select" data-node-id="${esc(object.id)}" aria-pressed="${selectedId === object.id}">${esc(name(object))}${object.locked ? ' · 已锁定' : ''}${object.hidden ? ' · 已隐藏' : ''}</button>`,
        )
        .join('')}</details>
    </section>`
  }
  function attributes(item) {
    if (!active || !item.id) return ''
    return `data-action="ppt-canvas-select" data-node-id="${esc(item.id)}" role="button" aria-label="选择对象：${esc(name(item))}" tabindex="-1"`
  }
  function selected(item) {
    return active && selectedId === item.id
  }
  function resizeHandle(item) {
    return selected(item) && !readonly()
      ? '<span class="ppt-resize-handle" data-canvas-resize="true" aria-hidden="true"></span>'
      : ''
  }
  function mutate(key, value) {
    const item = node()
    if (!item || readonly()) return
    if (editKey !== `${selectedId}:${key}`) {
      checkpoint()
      editKey = `${selectedId}:${key}`
    }
    if (key.startsWith('chart.')) item.chart[key.slice(6)] = value
    else item[key] = value
    if (item.type === 'chart' && slide().canvas.filter((n) => n.type === 'chart').length === 1)
      slide().chart = structuredClone(item.chart)
    if (key === 'text') {
      if (item.field) slide()[item.field] = value
      if (item.role) delete item.role
    }
    refresh()
  }
  function handleInput(element) {
    const key = element.dataset?.canvasProp
    const chartKey = element.dataset?.canvasChart
    if (!key && !chartKey) return false
    if (!node() || readonly()) return true
    if (chartKey) {
      const match = /^categories\.(\d+)$|^series\.(\d+)\.values\.(\d+)$/.exec(chartKey)
      if (!match) return true
      const chart = node().chart
      if (match[1] !== undefined) {
        checkpointOnce(chartKey)
        chart.categories[Number(match[1])] = element.value
      } else if (element.value !== '' && Number.isFinite(Number(element.value))) {
        checkpointOnce(chartKey)
        chart.series[Number(match[2])].values[Number(match[3])] = Number(element.value)
      }
      if (slide().canvas.filter((n) => n.type === 'chart').length === 1)
        slide().chart = structuredClone(chart)
      refresh()
      return true
    }
    let value = element.value
    if (['x', 'y', 'w', 'h', 'size'].includes(key)) {
      if (!value || !Number.isFinite(Number(value))) return true
      value = Number(value)
      const item = node()
      if (key === 'size') value = Math.max(8, Math.min(160, value))
      if (key === 'x') value = Math.max(0, Math.min(1280 - item.w, value))
      if (key === 'y') value = Math.max(0, Math.min(720 - item.h, value))
      if (key === 'w')
        value = Math.max(item.type === 'chart' ? 320 : 2, Math.min(1280 - item.x, value))
      if (key === 'h')
        value = Math.max(item.type === 'chart' ? 200 : 2, Math.min(720 - item.y, value))
    }
    if (key === 'color') value = value.replace('#', '').toUpperCase()
    mutate(key, value)
    return true
  }
  function checkpointOnce(key) {
    if (editKey !== `${selectedId}:${key}`) {
      checkpoint()
      editKey = `${selectedId}:${key}`
    }
  }
  function handleAction(action, element) {
    if (!action.startsWith('ppt-canvas-')) return false
    const command = action.slice(11)
    editKey = ''
    if (command === 'mode') {
      if (active) {
        active = false
        selectedId = null
      } else ensure()
      render()
      return true
    }
    if (command === 'select') {
      if (visibleSelectionId === element.dataset.nodeId) return true
      selectedId = element.dataset.nodeId
      render()
      return true
    }
    if (command === 'add-text') {
      addObject({
        type: 'text',
        text: '新的文字',
        size: 36,
        font: 'Microsoft YaHei',
        color: PRESENTATION_THEMES[getDeck().theme].ink,
        bold: false,
        align: 'left',
      })
      return true
    }
    if (command === 'add-rect') {
      addObject({
        type: 'rect',
        w: 240,
        h: 140,
        color: PRESENTATION_THEMES[getDeck().theme].accent,
      })
      return true
    }
    if (command === 'page-lock') {
      ensure()
      checkpoint()
      slide().locked = !slide().locked
      render()
      return true
    }
    if (!node()) return true
    if (command === 'lock' && !slide().locked) {
      checkpoint()
      node().locked = !node().locked
      render()
      return true
    }
    if (command === 'duplicate' && !slide().locked) {
      const copy = structuredClone(node())
      copy.id = presentationId()
      copy.locked = false
      copy.x = Math.min(1280 - copy.w, copy.x + 20)
      copy.y = Math.min(720 - copy.h, copy.y + 20)
      delete copy.field
      delete copy.role
      addObject(copy)
      return true
    }
    if (readonly()) return true
    if (command === 'delete') {
      checkpoint()
      slide().canvas = slide().canvas.filter((n) => n.id !== selectedId)
      selectedId = null
    } else if (command === 'hide') {
      checkpoint()
      node().hidden = !node().hidden
    } else if (command === 'front' || command === 'back') {
      checkpoint()
      const nodes = slide().canvas
      const i = nodes.findIndex((n) => n.id === selectedId)
      const other = command === 'front' ? Math.min(nodes.length - 1, i + 1) : Math.max(0, i - 1)
      ;[nodes[i], nodes[other]] = [nodes[other], nodes[i]]
    } else if (command === 'bold') {
      checkpoint()
      node().bold = !node().bold
    } else if (command.startsWith('align-')) {
      checkpoint()
      node().align = command.slice(6)
    } else if (command === 'contain' || command === 'cover') {
      checkpoint()
      node().fit = command
    }
    render()
    return true
  }
  function handlePointer(event) {
    if (!active || !slide()?.canvas) return
    if (event.type === 'dblclick') {
      const target = event.target.closest?.('[data-ppt-preview] [data-node-id]')
      if (!target) return
      selectedId = target.dataset.nodeId
      if (node()?.type !== 'text' || readonly()) return
      render()
      const input = document.querySelector('textarea[data-canvas-prop="text"]')
      input?.focus({ preventScroll: true })
      input?.select()
      return
    }
    if (event.type === 'pointerdown') {
      if (event.button !== 0 || event.target.closest?.('.ppt-inline-text')) return
      const target = event.target.closest?.('[data-ppt-preview] [data-node-id]')
      if (!target) return
      selectedId = target.dataset.nodeId
      if (readonly()) return
      const box = target.closest('[data-ppt-preview]').getBoundingClientRect()
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scale: 1280 / box.width,
        original: structuredClone(node()),
        resize: Boolean(event.target.dataset?.canvasResize),
        target,
        changed: false,
      }
      target.classList.add('is-selected')
      target.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    } else if (drag && event.pointerId === drag.pointerId) {
      if (event.type === 'pointermove') {
        const dx = (event.clientX - drag.x) * drag.scale,
          dy = (event.clientY - drag.y) * drag.scale
        if (!drag.changed && Math.abs(dx) + Math.abs(dy) < 3) return
        if (!drag.changed) {
          checkpoint()
          drag.changed = true
        }
        const item = node(),
          original = drag.original
        if (drag.resize) {
          item.w = Math.max(
            item.type === 'chart' ? 320 : 16,
            Math.min(1280 - item.x, original.w + dx),
          )
          item.h = Math.max(
            item.type === 'chart' ? 200 : 16,
            Math.min(720 - item.y, original.h + dy),
          )
        } else {
          item.x = Math.max(0, Math.min(1280 - item.w, original.x + dx))
          item.y = Math.max(0, Math.min(720 - item.h, original.y + dy))
        }
        reportDirty()
        for (const key of ['x', 'y', 'w', 'h'])
          drag.target.style[{ x: 'left', y: 'top', w: 'width', h: 'height' }[key]] =
            `${item[key] / (key === 'x' || key === 'w' ? 12.8 : 7.2)}%`
      } else if (event.type === 'pointerup' || event.type === 'pointercancel') {
        const changed = drag.changed
        drag = null
        if (changed) render()
      }
    }
  }
  function handleKeydown(event) {
    if (
      !active ||
      !node() ||
      event.target.matches?.('input,textarea,select,[contenteditable="true"]')
    )
      return false
    if (!event.target.closest?.('[data-ppt-preview],.ppt-object-editor')) return false
    if (event.key === 'Escape') {
      selectedId = null
      render()
      return true
    }
    if (readonly()) return false
    const distance = event.shiftKey ? 10 : 1
    const delta = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    }[event.key]
    if (delta) {
      checkpoint()
      node().x = Math.max(0, Math.min(1280 - node().w, node().x + delta[0]))
      node().y = Math.max(0, Math.min(720 - node().h, node().y + delta[1]))
      render()
      document.querySelector('[data-ppt-preview]')?.focus({ preventScroll: true })
      return true
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      handleAction('ppt-canvas-delete', {})
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      handleAction('ppt-canvas-duplicate', {})
      return true
    }
    return false
  }
  return {
    markup,
    toolbarMarkup,
    attributes,
    selected,
    resizeHandle,
    handleAction,
    handleInput,
    handlePointer,
    handleKeydown,
    addObject,
    reset,
    isActive: () => active,
    selectedId: () => node()?.id || null,
    selectedNode: node,
  }
}
