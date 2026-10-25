/** 弹窗内的焦点工具。 */

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
export function dialogFocusables(root) {
  const elements = /** @type {HTMLElement[]} */ ([
    ...root.querySelectorAll(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ])
  return elements.filter((element) => !element.disabled && element.offsetParent !== null)
}

/**
 * 让 Tab / Shift+Tab 在弹窗内部循环，避免焦点跑到背景页面。
 * @param {HTMLElement} root
 * @param {KeyboardEvent} event
 */
export function keepFocusInDialog(root, event) {
  if (event.key !== 'Tab') return
  const items = dialogFocusables(root)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
