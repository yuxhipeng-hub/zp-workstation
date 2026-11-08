// Measure in the top layer while hidden, then expose the popup at its final anchor.
export function placeCreationPopover(root, popup, trigger, align = 'start') {
  const wasOpen = popup.matches(':popover-open')
  popup.style.visibility = 'hidden'
  const rect = trigger.getBoundingClientRect()
  popup.style.zoom = String(1 / (Number(root.querySelector('.cc-plane').style.zoom) || 1))
  popup.style.maxHeight = `${Math.max(88, Math.min(280, Math.max(window.innerHeight - rect.bottom - 24, rect.top - 24)))}px`
  if (!wasOpen) popup.showPopover()
  const bounds = popup.getBoundingClientRect()
  const left = align === 'end' ? rect.right - bounds.width : rect.left
  popup.style.left = `${Math.max(16, Math.min(left, window.innerWidth - bounds.width - 16))}px`
  popup.style.top = `${rect.bottom + bounds.height + 24 <= window.innerHeight ? rect.bottom + 8 : Math.max(16, rect.top - bounds.height - 8)}px`
  popup.style.visibility = 'visible'
  return wasOpen
}
