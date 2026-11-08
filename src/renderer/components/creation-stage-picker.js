import { placeCreationPopover } from '../lib/creation-popover.js'

export function creationStagePicker(value, stages, e) {
  return `<div class="cc-stage-picker"><span>制作阶段</span><input type="hidden" data-cs-field="stage" value="${e(value)}"><button type="button" class="cc-stage-trigger" aria-label="制作阶段" aria-haspopup="listbox" aria-controls="cs-stage-options" aria-expanded="false"><span data-cs-stage-label>${e(value)}</span><i data-lucide="chevron-down" aria-hidden="true"></i></button><div id="cs-stage-options" class="cc-stage-options" popover="auto" role="listbox" aria-label="制作阶段选项">${stages.map((stage) => `<button type="button" class="button secondary" role="option" tabindex="-1" aria-selected="${stage === value}" data-cs-stage-option="${e(stage)}"><span>${e(stage)}</span><i data-lucide="check" class="cc-option-check" aria-hidden="true"></i></button>`).join('')}</div></div>`
}

export function hydrateCreationStagePicker(root, signal) {
  const picker = root.querySelector('.cc-stage-picker')
  if (!picker) return
  const trigger = picker.querySelector('.cc-stage-trigger')
  const popup = picker.querySelector('.cc-stage-options')
  const field = picker.querySelector('[data-cs-field="stage"]')
  const options = [...popup.querySelectorAll('[role="option"]')]
  const isOpen = () => popup.matches(':popover-open')
  const sync = () => trigger.setAttribute('aria-expanded', String(isOpen()))
  const focus = (index) => options[index]?.focus({ preventScroll: true })
  const close = (restore = false) => {
    if (isOpen()) popup.hidePopover()
    sync()
    if (restore) trigger.focus({ preventScroll: true })
  }
  const open = () => {
    placeCreationPopover(root, popup, trigger, 'end')
    sync()
    focus(
      Math.max(
        0,
        options.findIndex((option) => option.dataset.csStageOption === field.value),
      ),
    )
  }
  trigger.addEventListener('click', () => (isOpen() ? close(true) : open()), { signal })
  popup.addEventListener('toggle', sync, { signal })
  popup.addEventListener(
    'click',
    (event) => {
      const option = event.target.closest('[data-cs-stage-option]')
      if (!options.includes(option)) return
      field.value = option.dataset.csStageOption
      picker.querySelector('[data-cs-stage-label]').textContent = field.value
      for (const item of options) item.setAttribute('aria-selected', String(item === option))
      field.dispatchEvent(new Event('input', { bubbles: true }))
      close(true)
    },
    { signal },
  )
  trigger.addEventListener(
    'keydown',
    (event) => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      open()
    },
    { signal },
  )
  popup.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault()
        event.stopPropagation()
        close(true)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const current = options.indexOf(document.activeElement)
      focus(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
      )
    },
    { signal },
  )
  root.addEventListener(
    'scroll',
    (event) => {
      if (!popup.contains(event.target)) close()
    },
    { capture: true, passive: true, signal },
  )
  window.addEventListener('resize', () => close(), { signal })
  if (isOpen()) placeCreationPopover(root, popup, trigger, 'end')
  sync()
}
