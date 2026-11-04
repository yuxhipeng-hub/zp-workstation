const CELL_SIZE = 43
const POINTER_RADIUS = 132

class PptHomeParticles extends HTMLElement {
  connectedCallback() {
    const view = this.closest('main')
    const canvas = this.querySelector('canvas')
    const context = canvas?.getContext('2d')
    if (!view || !context) return

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
      const bounds = pointer && canvas.getBoundingClientRect()
      for (const particle of particles) {
        const x = particle.x + Math.sin(elapsed * 0.65 + particle.phase) * 7
        const y = particle.y + Math.cos(elapsed * 0.48 + particle.phase) * 9
        let ripple = 0
        let offsetX = 0
        let offsetY = 0
        if (bounds) {
          const dx = x - (pointer.x - bounds.left)
          const dy = y - (pointer.y - bounds.top)
          const distance = Math.hypot(dx, dy)
          ripple = Math.max(0, 1 - distance / POINTER_RADIUS)
          const push = (ripple * 38) / Math.max(distance, 1)
          offsetX = dx * push
          offsetY = dy * push
        }
        particle.offsetX += (offsetX - particle.offsetX) * 0.2
        particle.offsetY += (offsetY - particle.offsetY) * 0.2
        particle.glow += (ripple - particle.glow) * 0.2
        const hue = (particle.hue + elapsed * 9) % 360
        const opacity = particle.opacity + particle.glow * 0.38
        context.fillStyle = `hsla(${hue}, 76%, ${55 + particle.glow * 13}%, ${opacity})`
        context.beginPath()
        context.arc(
          x + particle.offsetX,
          y + particle.offsetY,
          particle.radius + particle.glow * 1.35,
          0,
          Math.PI * 2,
        )
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

      const columns = Math.ceil(width / CELL_SIZE)
      const rows = Math.ceil(height / CELL_SIZE)
      particles = Array.from({ length: columns * rows }, (_, index) => ({
        x: ((index % columns) + Math.random()) * (width / columns),
        y: (Math.floor(index / columns) + Math.random()) * (height / rows),
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() * 360,
        radius: 1 + Math.random() * 1.45,
        opacity: 0.28 + Math.random() * 0.32,
        offsetX: 0,
        offsetY: 0,
        glow: 0,
      }))
      draw()
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
    document.addEventListener('visibilitychange', syncMotion, { signal })
    reducedMotion.addEventListener('change', syncMotion, { signal })
    const observer = new ResizeObserver(resize)
    observer.observe(view)
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
