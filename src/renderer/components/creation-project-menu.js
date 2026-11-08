import { placeCreationPopover } from '../lib/creation-popover.js'

// Keep project actions in the top layer, anchored to their own disclosure button.
export function hydrateCreationProjectMenu(root, signal, onClose) {
  const popup = root.querySelector('.cc-group-menu')
  if (!popup) return
  const trigger = popup.closest('.cc-project').querySelector('[data-action="cs-group-menu"]')
  const close = (restore = false) => {
    if (!popup.isConnected) return
    if (restore) trigger.focus({ preventScroll: true })
    onClose()
  }
  const items = [...popup.querySelectorAll('[role="menuitem"]')]
  const focus = (index) => items[index]?.focus({ preventScroll: true })
  popup.addEventListener(
    'toggle',
    (event) => {
      if (event.newState === 'closed' && popup.isConnected) onClose()
    },
    { signal },
  )
  popup.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault()
        close(true)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const current = items.indexOf(document.activeElement)
      focus(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length,
      )
    },
    { signal },
  )
  trigger.addEventListener(
    'keydown',
    (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Escape') close(true)
      else focus(event.key === 'ArrowUp' ? items.length - 1 : 0)
    },
    { signal },
  )
  root
    .querySelector('.cc-viewport')
    .addEventListener('scroll', () => close(), { passive: true, signal })
  window.addEventListener('resize', () => close(), { signal })
  const wasOpen = placeCreationPopover(root, popup, trigger)
  if (!wasOpen) focus(0)
}
