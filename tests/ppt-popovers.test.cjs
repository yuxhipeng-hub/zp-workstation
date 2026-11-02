const test = require('node:test')
const assert = require('node:assert/strict')
const { dismissPptPopovers } = require('../src/renderer/lib/ppt-popovers.js')

test('PPT menus close on outside input, keep inside controls usable and restore focus on Escape', () => {
  const input = {},
    outside = {}
  let open = true,
    focused = 0
  const menu = {
    contains: (target) => target === input,
    removeAttribute: (name) => {
      assert.equal(name, 'open')
      open = false
    },
    querySelector: () => ({ focus: () => focused++ }),
  }
  const root = {
    activeElement: input,
    querySelectorAll: (selector) => {
      assert.doesNotMatch(selector, /speaker-notes|object-style/)
      return open ? [menu] : []
    },
  }
  assert.equal(dismissPptPopovers(root, input), false)
  assert.equal(open, true)
  assert.equal(dismissPptPopovers(root, outside), true)
  assert.equal(focused, 0)
  open = true
  assert.equal(dismissPptPopovers(root, null, true), true)
  assert.equal(focused, 1)
})
