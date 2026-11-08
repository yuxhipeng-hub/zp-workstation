const types = ['text', 'rect', 'ellipse', 'chart', 'image']
const fonts = ['Microsoft YaHei', 'SimSun', 'Arial']
const fields = ['title', 'body', 'eyebrow']
const string = (value, max, required = false) => {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error('对象文字或编号无效。')
  return value
}
const number = (value, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('对象位置、大小或字号无效。')
  return value
}
const color = (value) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{6}$/i.test(value)) throw new Error('对象颜色无效。')
  return value.toUpperCase()
}
export function imageDimensions(bytes) {
  const read16 = (i) => (bytes[i] << 8) | bytes[i + 1]
  const read32 = (i) =>
    bytes[i] * 16777216 + bytes[i + 1] * 65536 + bytes[i + 2] * 256 + bytes[i + 3]
  if (
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes.length >= 24
  )
    return { width: read32(16), height: read32(20) }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let i = 2
    while (i + 4 < bytes.length) {
      if (bytes[i++] !== 255) break
      while (bytes[i] === 255) i++
      const marker = bytes[i++]
      if (marker === 0xd8 || marker === 0xd9) continue
      if (marker === 0xda) break
      const length = read16(i)
      if (length < 2 || i + length > bytes.length) break
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      )
        return { width: read16(i + 5), height: read16(i + 3) }
      i += length
    }
  }
  throw new Error('图片尺寸信息无效。')
}
export function validateImageData(data) {
  if (
    typeof data !== 'string' ||
    data.length > 800000 ||
    !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new Error('图片需要有效的 PNG/JPEG，且压缩后不超过 600 KB。')
  const bytes = globalThis.atob(data.slice(data.indexOf(',') + 1))
  const png = bytes.charCodeAt(0) === 137 && bytes.slice(1, 4) === 'PNG'
  const jpeg = bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216
  if (!png && !jpeg) throw new Error('图片内容与格式不符。')
  if (data.startsWith('data:image/png;') !== png) throw new Error('图片内容与格式不符。')
  const size = imageDimensions(Uint8Array.from(bytes, (c) => c.charCodeAt(0)))
  if (!size.width || !size.height || size.width * size.height > 40000000)
    throw new Error('图片尺寸过大或无效。')
  return data
}
export function presentationCanvas(value, validateChart) {
  if (!Array.isArray(value) || value.length > 120) throw new Error('每页最多 120 个对象。')
  const ids = new Set()
  return value.map((source) => {
    if (!source || typeof source !== 'object' || !types.includes(source.type))
      throw new Error('对象类型无效。')
    const id = string(source.id, 80, true)
    if (ids.has(id)) throw new Error('对象编号重复。')
    ids.add(id)
    for (const key of ['locked', 'hidden', 'bold'])
      if (source[key] !== undefined && typeof source[key] !== 'boolean')
        throw new Error('对象状态无效。')
    const node = {
      id,
      type: source.type,
      x: number(source.x, 0, 1280),
      y: number(source.y, 0, 720),
      w: number(source.w, 0.1, 1280),
      h: number(source.h, 0.1, 720),
      locked: Boolean(source.locked),
      hidden: Boolean(source.hidden),
    }
    if (node.x + node.w > 1280.01 || node.y + node.h > 720.01)
      throw new Error('对象不能超出页面边界。')
    if (source.name !== undefined) node.name = string(source.name, 80)
    if (source.role === 'pageNumber') node.role = 'pageNumber'
    if (source.field !== undefined) {
      if (!fields.includes(source.field)) throw new Error('对象绑定无效。')
      node.field = source.field
    }
    if (source.type === 'text') {
      Object.assign(node, {
        text: string(source.text, 4000),
        size: number(source.size, 8, 160),
        color: color(source.color),
        font: fonts.includes(source.font) ? source.font : 'Microsoft YaHei',
        bold: Boolean(source.bold),
        align: ['left', 'center', 'right'].includes(source.align) ? source.align : 'left',
      })
    } else if (source.type === 'chart') {
      if (node.w < 320 || node.h < 200) throw new Error('图表至少需要 320×200 的可读空间。')
      node.chart = validateChart(source.chart)
      if (source.colors !== undefined) {
        if (!Array.isArray(source.colors) || source.colors.length !== 3)
          throw new Error('图表颜色无效。')
        node.colors = source.colors.map(color)
      }
    } else if (source.type === 'image') {
      node.data = validateImageData(source.data)
      node.fit = source.fit === 'cover' ? 'cover' : 'contain'
    } else node.color = color(source.color)
    return node
  })
}
export function canvasFromScene(scene, slide) {
  return scene.nodes.map((source) => {
    const node = globalThis.structuredClone(source)
    delete node.preview
    delete node.overflow
    delete node.displayText
    delete node.scale
    node.id = globalThis.crypto.randomUUID()
    node.locked = false
    node.hidden = false
    if (node.type === 'text') {
      node.align = 'left'
      node.bold = Boolean(node.bold)
      if (node.text === slide.title) node.field = 'title'
      else if (node.text === slide.body) node.field = 'body'
      else if (node.text === slide.eyebrow) node.field = 'eyebrow'
      if (node.x === 1090 && node.y === 658) node.role = 'pageNumber'
    }
    return node
  })
}
export function modelPresentation(deck) {
  if (!deck) return null
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      ...(slide.canvas
        ? {
            canvas: slide.canvas.map((source) => {
              const node = { ...source }
              delete node.data
              return node
            }),
          }
        : {}),
    })),
  }
}
export function assertCanvasLocks(current, next) {
  for (const slide of current.slides) {
    const updated = next.slides.find((s) => s.id === slide.id)
    if (slide.locked && JSON.stringify(slide) !== JSON.stringify(updated))
      throw new Error('页面已锁定，请先在界面解锁。')
    for (const node of slide.canvas || [])
      if (node.locked) {
        const changed = updated?.canvas?.find((n) => n.id === node.id)
        if (JSON.stringify(node) !== JSON.stringify(changed))
          throw new Error('对象已锁定，请先在界面解锁。')
      }
  }
}
