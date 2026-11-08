import { keepFocusInDialog } from '../lib/focus.js'

/** 未保存作品的直接操作弹窗；取消、Esc 和点击遮罩都保留当前草稿。 */
export function openSaveChangesDialog({ returnFocus = null } = {}) {
  const root = document.querySelector('#dialogRoot')
  if (!root) return Promise.resolve('cancel')

  return new Promise((resolve) => {
    let settled = false
    const finish = (choice) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', handleKeydown)
      root.innerHTML = ''
      resolve(choice)
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus()
      })
    }
    const handleKeydown = (event) => {
      keepFocusInDialog(root, event)
      if (event.key === 'Escape') {
        event.preventDefault()
        finish('cancel')
      }
    }

    root.innerHTML = `
      <div class="dialog-layer">
        <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="saveChangesTitle" aria-describedby="saveChangesDescription">
          <div class="dialog-heading">
            <span class="dialog-eyebrow">LOCAL WORKSPACE</span>
            <h2 id="saveChangesTitle">当前作品尚未保存</h2>
            <p id="saveChangesDescription">是否保存本次修改？选择不保存会放弃这些修改。</p>
          </div>
          <div class="dialog-form">
            <div class="dialog-actions">
              <button class="button primary" type="button" data-save-choice="save">保存</button>
              <button class="button secondary" type="button" data-save-choice="discard">不保存</button>
              <button class="button secondary" type="button" data-save-choice="cancel">取消</button>
            </div>
          </div>
        </section>
      </div>`
    root.querySelectorAll('[data-save-choice]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.saveChoice))
    })
    const layer = root.querySelector('.dialog-layer')
    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer) finish('cancel')
    })
    document.addEventListener('keydown', handleKeydown)
    requestAnimationFrame(() => root.querySelector('[data-save-choice="save"]')?.focus())
  })
}
