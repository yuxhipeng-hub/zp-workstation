const CELL_SIZE = 23
const MAX_PARTICLES = 3200
const POINTER_RADIUS = 116

function distanceFromReadingArea(x, y, area) {
  const dx = Math.abs(x - area.centerX) - area.halfWidth + area.radius
  const dy = Math.abs(y - area.centerY) - area.halfHeight + area.radius
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - area.radius
}

function readingAreaOpacity(distance) {
  // Fade across the rounded edge. Inside, only a trace of the original particle remains.
  const blend = Math.max(0, Math.min(1, (distance + 10) / 34))
  return 0.12 + 0.88 * blend * blend * (3 - 2 * blend)
}

class PptHomeParticles extends HTMLElement {
  connectedCallback() {
    const view = this.closest('main')
    const canvas = this.querySelector('canvas')
    const composer = this.parentElement?.querySelector('.ppt-start .ppt-composer')
    const context = canvas?.getContext('2d')
    if (!view || !context) return
    const cornerRadius = composer ? parseFloat(getComputedStyle(composer).borderTopLeftRadius) : 0

    const listeners = new AbortController()
    const { signal } = listeners
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let particles = []
    let width = 0
    let height = 0
    let scale = 0
    let frame = 0
    let previousTime = 0
    let elapsed = 0
    let pointer = null

    function draw() {
      context.clearRect(0, 0, width, height)
      const bounds = canvas.getBoundingClientRect()
      const composerBounds = composer?.getBoundingClientRect()
      const readingArea = composerBounds && {
        centerX: composerBounds.left - bounds.left + composerBounds.width / 2,
        centerY: composerBounds.top - bounds.top + composerBounds.height / 2,
        halfWidth: composerBounds.width / 2,
        halfHeight: composerBounds.height / 2,
        radius: cornerRadius,
      }
      const cursor = pointer && { x: pointer.x - bounds.left, y: pointer.y - bounds.top }
      const react =
        cursor && (!readingArea || distanceFromReadingArea(cursor.x, cursor.y, readingArea) > 0)
      const colorPhase = elapsed * 0.16
      for (const particle of particles) {
        const x = particle.x + Math.sin(elapsed * 0.46 + particle.phase) * 4
        const y = particle.y + Math.cos(elapsed * 0.37 + particle.phase) * 5
        let ripple = 0
        let offsetX = 0
        let offsetY = 0
        if (react) {
          const dx = x - cursor.x
          const dy = y - cursor.y
          const squaredDistance = dx * dx + dy * dy
          if (squaredDistance < POINTER_RADIUS * POINTER_RADIUS) {
            const distance = Math.sqrt(squaredDistance)
            ripple = 1 - distance / POINTER_RADIUS
            const push = (ripple * 11) / Math.max(distance, 1)
            offsetX = dx * push
            offsetY = dy * push
          }
        }
        particle.offsetX += (offsetX - particle.offsetX) * 0.15
        particle.offsetY += (offsetY - particle.offsetY) * 0.15
        particle.glow += (ripple - particle.glow) * 0.15
        const drawX = x + particle.offsetX
        const drawY = y + particle.offsetY
        const visibility = readingArea
          ? readingAreaOpacity(distanceFromReadingArea(drawX, drawY, readingArea))
          : 1
        const hue = particle.hue + particle.hueRange * Math.sin(colorPhase + particle.hue / 30)
        const glow = particle.glow * visibility
        const opacity = (particle.opacity + glow * 0.26) * visibility
        context.fillStyle = `hsla(${hue}, 73%, ${55 + glow * 12}%, ${opacity})`
        context.beginPath()
        context.arc(drawX, drawY, Math.min(1, particle.radius + glow * 0.18), 0, Math.PI * 2)
        context.fill()
      }
    }

    function tick(now) {
      if (now - previousTime >= 30) {
        if (previousTime) elapsed += Math.min((now - previousTime) / 1000, 0.08)
        previousTime = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }

    function syncMotion() {
      cancelAnimationFrame(frame)
      frame = 0
      previousTime = 0
      pointer = null
      if (document.hidden) return
      if (reducedMotion.matches) {
        for (const particle of particles) particle.offsetX = particle.offsetY = particle.glow = 0
        draw()
      } else {
        frame = requestAnimationFrame(tick)
      }
    }

    const resize = () => {
      const nextWidth = view.clientWidth
      const nextHeight = view.clientHeight
      const nextScale = Math.min(2, window.devicePixelRatio || 1)
      if (width === nextWidth && height === nextHeight && scale === nextScale) return
      width = nextWidth
      height = nextHeight
      scale = nextScale
      this.style.setProperty('--ppt-particle-height', `${height}px`)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)

      const cellSize = Math.max(CELL_SIZE, Math.sqrt((width * height) / MAX_PARTICLES))
      const columns = Math.ceil(width / cellSize)
      const rows = Math.ceil(height / cellSize)
      particles = Array.from({ length: columns * rows }, (_, index) => {
        const column = ((index % columns) + Math.random()) / columns
        const row = (Math.floor(index / columns) + Math.random()) / rows
        const amber = Math.random() < 0.045
        return {
          x: column * width,
          y: row * height,
          phase: Math.random() * Math.PI * 2,
          hue: amber ? 40 : 223 + 33 * Math.sin(column * 4.6 + row * 2.1),
          hueRange: amber ? 6 : 17,
          radius: Math.random() < 0.08 ? 0.82 + Math.random() * 0.14 : 0.4 + Math.random() * 0.4,
          opacity: 0.33 + Math.random() * 0.26,
          offsetX: 0,
          offsetY: 0,
          glow: 0,
        }
      })
    }

    view.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'touch' && !reducedMotion.matches)
          pointer = { x: event.clientX, y: event.clientY }
      },
      { passive: true, signal },
    )
    const clearPointer = () => (pointer = null)
    view.addEventListener('pointerleave', clearPointer, { signal })
    view.addEventListener('pointercancel', clearPointer, { signal })
    view.addEventListener(
      'scroll',
      () => {
        if (reducedMotion.matches) draw()
      },
      { passive: true, signal },
    )
    document.addEventListener('visibilitychange', syncMotion, { signal })
    reducedMotion.addEventListener('change', syncMotion, { signal })
    const observer = new ResizeObserver(() => {
      resize()
      if (reducedMotion.matches) draw()
    })
    observer.observe(view)
    if (composer) observer.observe(composer)
    resize()
    syncMotion()

    this.cleanup = () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      listeners.abort()
    }
  }

  disconnectedCallback() {
    this.cleanup?.()
  }
}

customElements.define('ppt-home-particles', PptHomeParticles)
