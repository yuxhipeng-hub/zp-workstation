// Keep canvas objects and decoded media alive while changing a local disclosure.
const animations = new Set()
const surface = '.cc-videos,.cc-roles,.cc-shot-list,.cc-composer,.cc-workpage'
function key(node) {
  if (node.nodeType !== 1) return ''
  const d = node.dataset
  if (d.lucide) return 'icon:' + d.lucide
  if (d.csKey) return d.csKey
  if (d.ccRoot) return 'project:' + d.ccRoot
  if (d.ccVideo) return 'video:' + d.ccVideo
  if (d.csThumbnail) return 'thumbnail:' + d.csThumbnail
  if (d.csPreview) return 'preview:' + d.artifact + ':' + d.csPreview
  if (d.csMedia) return 'media:' + d.csMedia
  if (d.action) return 'action:' + d.action + ':' + (d.video || '') + ':' + (d.id || '')
  if (node.id) return 'id:' + node.id
  return (
    [
      'cc-studio',
      'cc-viewport',
      'cc-plane',
      'cc-projects',
      'cc-root',
      'cc-videos',
      'cc-video-object',
      'cc-roles',
    ].find((c) => node.classList.contains(c)) || ''
  )
}
function same(a, b) {
  return (
    a?.nodeType === b.nodeType &&
    (a.nodeType !== 1 || (a.tagName === b.tagName && key(a) === key(b)))
  )
}
function patch(node, next, added) {
  if (node.nodeType !== 1) {
    if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue
    return
  }
  // Lucide has already replaced this icon. Keep its rendered SVG.
  if (node.localName === 'svg' && next.dataset.lucide === node.dataset.lucide) return
  if (node.dataset.csMedia && node.childElementCount) return
  if (node.matches('[data-cs-acceptance],[data-cs-latest]')) return
  const height = node.matches(
    'textarea[data-v-autogrow],.cc-composer textarea[data-cs-field="brief"]',
  )
    ? node.style.height
    : ''
  for (const attr of [...node.attributes])
    if (!next.hasAttribute(attr.name)) node.removeAttribute(attr.name)
  for (const attr of next.attributes)
    if (node.getAttribute(attr.name) !== attr.value) node.setAttribute(attr.name, attr.value)
  if (height) node.style.height = height
  // Revalidation in hydrate updates health and changed sources; never insert a loading placeholder over live media.
  const byKey = new Map()
  for (const child of node.childNodes) if (key(child)) byKey.set(key(child), child)
  let cursor = node.firstChild
  for (const desired of [...next.childNodes]) {
    const id = key(desired)
    let found = id ? byKey.get(id) : cursor && !key(cursor) && same(cursor, desired) ? cursor : null
    if (found?.localName === 'svg' && desired.dataset?.lucide === found.dataset.lucide) {
      // Keep the icon even though the template still contains an <i> element.
    } else if (found && !same(found, desired)) found = null
    if (!found) {
      found = desired.cloneNode(true)
      node.insertBefore(found, cursor)
      if (found.nodeType === 1) added.push(found)
    } else {
      if (found !== cursor) node.insertBefore(found, cursor)
      patch(found, desired, added)
    }
    cursor = found.nextSibling
  }
  while (cursor) {
    const old = cursor
    cursor = cursor.nextSibling
    old.remove()
  }
  if (
    node.matches('input,textarea,select') &&
    document.activeElement !== node &&
    node.value !== next.value
  )
    node.value = next.value
}
export function updateCreationDom(view, html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const next = template.content.firstElementChild
  const current = view.querySelector(':scope > .cc-studio')
  if (!current) {
    view.replaceChildren(template.content)
    return
  }
  const useMotion =
    next.dataset.csMotion === 'true' && !matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const animation of animations) animation.cancel()
  animations.clear()
  const positions = new Map()
  if (useMotion)
    for (const node of current.querySelectorAll(
      '.cc-project,.cc-video,.cc-stage-node,.cc-shot-node',
    ))
      positions.set(node, node.getBoundingClientRect())
  const added = []
  patch(current, next, added)
  if (!useMotion) return
  const play = (node, frames) => {
    const animation = node.animate(frames, { duration: 120, easing: 'cubic-bezier(.23,1,.32,1)' })
    animations.add(animation)
    animation.finished.catch(() => {}).finally(() => animations.delete(animation))
  }
  for (const node of added) {
    const target = node.matches(surface) ? node : node.querySelector(surface)
    if (target)
      play(target, [
        { opacity: 0.88, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ])
  }
  const moved = []
  for (const [node, before] of positions) {
    if (!node.isConnected) continue
    if (moved.some((parent) => parent.contains(node))) continue
    const after = node.getBoundingClientRect(),
      dy = before.top - after.top
    if (Math.abs(dy) > 1 && Math.abs(dy) < 600) {
      play(node, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }])
      moved.push(node)
    }
  }
}
