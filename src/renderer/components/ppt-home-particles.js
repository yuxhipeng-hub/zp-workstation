import { createGrainRenderer } from './ppt-home-grain-shader.js'

function createStaticRenderer(canvas) {
  const context = canvas.getContext('2d')
  const tile = document.createElement('canvas')
  tile.width = tile.height = 288
  const tileContext = tile.getContext('2d')
  const texture = tileContext.createImageData(tile.width, tile.height)
  const colors = [
    [92, 157, 234],
    [112, 92, 238],
    [201, 105, 215],
    [227, 152, 103],
  ]
  for (let y = 0; y < tile.height; y += 3) {
    for (let x = 0; x < tile.width; x += 3) {
      const color = colors[Math.floor(Math.random() * colors.length)]
      const opacity = 19 + Math.random() * 28
      for (let dy = 0; dy < 3; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          const index = ((y + dy) * tile.width + x + dx) * 4
          texture.data.set(color, index)
          texture.data[index + 3] = opacity * (1 - Math.hypot(dx - 1, dy - 1) * 0.56)
        }
      }
    }
  }
  tileContext.putImageData(texture, 0, 0)
  const pattern = context.createPattern(tile, 'repeat')
  pattern.setTransform(new DOMMatrix().scale(1 / 3))
  return {
    resize(width, height) {
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
    },
    draw({ area, width, height }) {
      context.clearRect(0, 0, width, height)
      context.fillStyle = pattern
      context.fillRect(0, 0, width, height)
      context.save()
      context.globalCompositeOperation = 'destination-out'
      context.fillStyle = 'rgba(0,0,0,0.28)'
      for (const margin of [26, 17, 8, 0]) {
        context.beginPath()
        context.roundRect(
          area.x - area.width / 2 - margin,
          area.y - area.height / 2 - margin,
          area.width + margin * 2,
          area.height + margin * 2,
          area.radius + margin,
        )
        context.fill()
      }
      context.restore()
    },
    dispose() {},
  }
}

class PptHomeParticles extends HTMLElement {
  connectedCallback() {
    const view = this.closest('main')
    let canvas = this.querySelector('canvas')
    const composer = this.parentElement?.querySelector('.ppt-start .ppt-composer')
    if (!view || !canvas || !composer) return
    const listeners = new AbortController()
    const { signal } = listeners
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const radius = parseFloat(getComputedStyle(composer).borderTopLeftRadius) || 0
    let renderer = createGrainRenderer(canvas)
    let animated = Boolean(renderer)
    let width = 0
    let height = 0
    let frame = 0
    let previousTime = 0
    let time = 0
    let focus = 0
    let pointer = null
    const cursor = { x: 0, y: 0, strength: 0 }

    const useStaticRenderer = () => {
      // A canvas that has owned a GL context cannot be reused for 2D drawing.
      const replacement = document.createElement('canvas')
      canvas.replaceWith(replacement)
      canvas = replacement
      animated = false
      this.dataset.renderer = 'static'
      renderer = createStaticRenderer(canvas)
    }
    if (renderer) this.dataset.renderer = 'shader'
    else useStaticRenderer()

    function draw() {
      if (!width || !height) return
      const bounds = canvas.getBoundingClientRect()
      const box = composer.getBoundingClientRect()
      const focused = composer.matches(':focus-within') ? 1 : 0
      const still = reducedMotion.matches || !animated
      focus = still ? focused : focus + (focused - focus) * 0.16
      if (pointer) {
        cursor.x = pointer.x - bounds.left
        cursor.y = pointer.y - bounds.top
      }
      cursor.strength = still ? 0 : cursor.strength + ((pointer ? 1 : 0) - cursor.strength) * 0.23
      renderer.draw({
        width,
        height,
        area: {
          x: box.left - bounds.left + box.width / 2,
          y: box.top - bounds.top + box.height / 2,
          width: box.width,
          height: box.height,
          radius,
        },
        cursor,
        time,
        focus,
        light: document.body.dataset.theme === 'light',
      })
    }

    function tick(now) {
      if (now - previousTime >= 30) {
        if (previousTime) time += Math.min((now - previousTime) / 1000, 0.08)
        previousTime = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }

    function redrawStatic() {
      if (document.hidden || (animated && !reducedMotion.matches)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }

    function syncMotion() {
      cancelAnimationFrame(frame)
      previousTime = 0
      pointer = null
      cursor.strength = 0
      if (document.hidden) return
      if (animated && !reducedMotion.matches) frame = requestAnimationFrame(tick)
      else redrawStatic()
    }

    const resize = () => {
      width = view.clientWidth
      height = view.clientHeight
      if (!width || !height) return
      const scale = Math.min(
        1.5,
        window.devicePixelRatio || 1,
        Math.sqrt(2600000 / (width * height)),
      )
      const pixelWidth = Math.round(width * scale)
      const pixelHeight = Math.round(height * scale)
      this.style.setProperty('--ppt-particle-height', `${height}px`)
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      renderer.resize(width, height)
      redrawStatic()
    }

    canvas.addEventListener(
      'webglcontextlost',
      () => {
        useStaticRenderer()
        resize()
        syncMotion()
      },
      { signal },
    )
    view.addEventListener(
      'pointermove',
      (event) => {
        if (animated && !reducedMotion.matches && event.pointerType !== 'touch')
          pointer = { x: event.clientX, y: event.clientY }
      },
      { passive: true, signal },
    )
    const clearPointer = () => (pointer = null)
    view.addEventListener('pointerleave', clearPointer, { signal })
    view.addEventListener('pointercancel', clearPointer, { signal })
    view.addEventListener('scroll', redrawStatic, { passive: true, signal })
    composer.addEventListener('focusin', redrawStatic, { signal })
    composer.addEventListener('focusout', redrawStatic, { signal })
    document.addEventListener('visibilitychange', syncMotion, { signal })
    reducedMotion.addEventListener('change', syncMotion, { signal })
    const observer = new ResizeObserver(resize)
    observer.observe(view)
    observer.observe(composer)
    resize()
    syncMotion()

    this.cleanup = () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      listeners.abort()
      renderer.dispose()
    }
  }

  disconnectedCallback() {
    this.cleanup?.()
  }
}

customElements.define('ppt-home-particles', PptHomeParticles)
