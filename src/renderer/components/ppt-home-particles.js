const CELL_SIZE = 14
const MAX_PARTICLES = 6800
const POINTER_RADIUS = 116
const SPRITE_SIZE = 14
const HUE_STEP = 2

let particleAtlas

function getParticleAtlas() {
  if (particleAtlas) return particleAtlas
  const atlas = document.createElement('canvas')
  atlas.width = (360 / HUE_STEP) * SPRITE_SIZE
  atlas.height = SPRITE_SIZE
  const context = atlas.getContext('2d')
  const radius = SPRITE_SIZE / 2
  for (let hue = 0; hue < 360; hue += HUE_STEP) {
    const start = (hue / HUE_STEP) * SPRITE_SIZE
    const center = start + radius
    const light = context.createRadialGradient(center, radius, 0, center, radius, radius)
    light.addColorStop(0, `hsl(${hue}, 92%, 73%)`)
    light.addColorStop(0.5, `hsl(${(hue + 10) % 360}, 91%, 53%)`)
    light.addColorStop(1, `hsl(${(hue + 18) % 360} 92% 52% / 0)`)
    context.fillStyle = light
    context.fillRect(start, 0, SPRITE_SIZE, SPRITE_SIZE)
  }
  particleAtlas = atlas
  return atlas
}

function distanceFromReadingArea(x, y, area) {
  const dx = Math.abs(x - area.centerX) - area.halfWidth + area.radius
  const dy = Math.abs(y - area.centerY) - area.halfHeight + area.radius
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - area.radius
}

function readingAreaOpacity(distance) {
  // Fade across the rounded edge. Inside, only a trace of the original particle remains.
  const blend = Math.max(0, Math.min(1, (distance + 10) / 34))
  return 0.28 + 0.72 * blend * blend * (3 - 2 * blend)
}

class PptHomeParticles extends HTMLElement {
  connectedCallback() {
    const view = this.closest('main')
    const canvas = this.querySelector('canvas')
    const composer = this.parentElement?.querySelector('.ppt-start .ppt-composer')
    const context = canvas?.getContext('2d')
    if (!view || !context) return
    const atlas = getParticleAtlas()
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
      const pointerInReadingArea =
        cursor && readingArea && distanceFromReadingArea(cursor.x, cursor.y, readingArea) <= 0
      const pushDistance = pointerInReadingArea ? 7 : 9
      const colorPhase = elapsed * 0.24
      for (const particle of particles) {
        const x = particle.x + Math.sin(elapsed * 0.46 + particle.phase) * 4
        const y = particle.y + Math.cos(elapsed * 0.37 + particle.phase) * 5
        let ripple = 0
        let offsetX = 0
        let offsetY = 0
        if (cursor) {
          const dx = x - cursor.x
          const dy = y - cursor.y
          const squaredDistance = dx * dx + dy * dy
          if (squaredDistance < POINTER_RADIUS * POINTER_RADIUS) {
            const distance = Math.sqrt(squaredDistance)
            ripple = 1 - distance / POINTER_RADIUS
            const push = (ripple * pushDistance) / Math.max(distance, 1)
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
        const hueWave = Math.sin(colorPhase + particle.colorOffset)
        const hue = particle.amber ? 34 + hueWave * 12 : 237 + hueWave * 54
        const spriteX = Math.floor(hue / HUE_STEP) * SPRITE_SIZE
        const radius = Math.min(1.28, particle.radius + particle.glow * 0.4)
        context.globalAlpha = Math.min(1, particle.opacity * visibility + particle.glow * 0.45)
        context.drawImage(
          atlas,
          spriteX,
          0,
          SPRITE_SIZE,
          SPRITE_SIZE,
          drawX - radius,
          drawY - radius,
          radius * 2,
          radius * 2,
        )
      }
      context.globalAlpha = 1
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
        return {
          x: column * width,
          y: row * height,
          phase: Math.random() * Math.PI * 2,
          colorOffset: column * 4.7 + row * 2.3 + Math.random() * 0.2,
          amber: Math.random() < 0.05,
          radius: Math.random() < 0.08 ? 0.88 + Math.random() * 0.14 : 0.5 + Math.random() * 0.36,
          opacity: 0.65 + Math.random() * 0.25,
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
