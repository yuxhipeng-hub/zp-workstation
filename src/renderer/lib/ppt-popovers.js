const selector =
  '.ppt-utility-menu[open],.ppt-page-settings[open],.ppt-page-menu[open],.ppt-export-menu[open]'

/** 仅关闭临时菜单，保留讲稿和对象属性等正文折叠区。 */
export function dismissPptPopovers(root, target = null, restoreFocus = false) {
  let closed = false
  for (const menu of root.querySelectorAll(selector)) {
    if (target && menu.contains(target)) continue
    const focused = restoreFocus && menu.contains(root.activeElement)
    menu.removeAttribute('open')
    if (focused) menu.querySelector('summary')?.focus({ preventScroll: true })
    closed = true
  }
  return closed
}
