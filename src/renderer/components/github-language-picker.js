export function createGitHubLanguagePicker({
  values,
  selected,
  onSelect,
  escapeHtml: e,
  refreshIcons,
}) {
  const trigger = () => document.querySelector('#githubLanguage')
  const menu = () => document.querySelector('#githubLanguageMenu')
  const isOpen = () => Boolean(menu()?.matches(':popover-open'))

  function options() {
    return ['', ...values()]
      .map(
        (value) =>
          `<button type="button" role="option" tabindex="-1" aria-selected="${selected() === value}" data-action="gh-language-select" data-value="${e(value)}"><span>${e(value || '全部语言')}</span>${selected() === value ? '<i data-lucide="check" aria-hidden="true"></i>' : '<span aria-hidden="true"></span>'}</button>`,
      )
      .join('')
  }

  function sync() {
    trigger()?.setAttribute('aria-expanded', String(isOpen()))
    const popup = menu()
    if (popup && !isOpen()) popup.innerHTML = options()
  }

  function close(restore = false) {
    if (isOpen()) menu().hidePopover()
    trigger()?.setAttribute('aria-expanded', 'false')
    if (restore) trigger()?.focus({ preventScroll: true })
  }

  function focusOption(option) {
    if (!option) return
    option.focus({ preventScroll: true })
    const popup = menu()
    if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = option.offsetTop + option.offsetHeight - popup.clientHeight
  }

  function open() {
    if (isOpen()) {
      focusOption(menu().querySelector('[aria-selected="true"]'))
      return
    }
    sync()
    const popup = menu(),
      button = trigger()
    if (!popup || !button) return
    const rect = button.getBoundingClientRect()
    popup.style.maxHeight = `${Math.max(88, Math.min(280, Math.max(window.innerHeight - rect.bottom - 24, rect.top - 24)))}px`
    popup.showPopover()
    const bounds = popup.getBoundingClientRect()
    popup.style.left = `${Math.max(16, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 16))}px`
    popup.style.top = `${rect.bottom + bounds.height + 24 <= window.innerHeight ? rect.bottom + 8 : Math.max(16, rect.top - bounds.height - 8)}px`
    button.setAttribute('aria-expanded', 'true')
    refreshIcons()
    focusOption(popup.querySelector('[aria-selected="true"]'))
  }

  function handleAction(action, element) {
    if (action === 'gh-language-toggle') {
      if (isOpen()) close(true)
      else open()
      return true
    }
    if (action !== 'gh-language-select') return false
    const value = element.dataset.value || ''
    if (value && !values().includes(value)) return true
    close()
    onSelect(value)
    return true
  }

  function handleKeydown(event) {
    const inMenu = event.target.closest?.('#githubLanguageMenu')
    if (event.target.id === 'githubLanguage' && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      open()
      if (event.key === 'ArrowUp') focusOption(menu().querySelector('[role="option"]:last-child'))
      return true
    }
    if (!inMenu) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return true
    }
    if (event.key === 'Tab') {
      close(true)
      return false
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false
    event.preventDefault()
    const items = [...menu().querySelectorAll('[role="option"]')]
    const current = items.indexOf(document.activeElement)
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    focusOption(items[index])
    return true
  }

  // One picker instance per page; the top layer escapes the workbench's clipped canvas.
  document.addEventListener(
    'toggle',
    (event) => {
      if (event.target.id === 'githubLanguageMenu')
        trigger()?.setAttribute('aria-expanded', String(isOpen()))
    },
    true,
  )
  document.addEventListener(
    'scroll',
    (event) => {
      if (event.target.id === 'view') close()
    },
    true,
  )
  window.addEventListener('resize', () => close())

  return {
    sync,
    close,
    handleAction,
    handleKeydown,
    triggerMarkup: (label) =>
      `<button type="button" id="githubLanguage" class="gh-language-trigger" data-action="gh-language-toggle" aria-label="${e(label)}" aria-haspopup="listbox" aria-controls="githubLanguageMenu" aria-expanded="${isOpen()}"><span>${e(selected() || '全部语言')}</span><i data-lucide="chevron-down" aria-hidden="true"></i></button>`,
    menuMarkup: () =>
      `<div id="githubLanguageMenu" class="gh-language-menu" popover="auto" role="listbox" aria-label="编程语言">${options()}</div>`,
  }
}
