const assert = require('node:assert/strict')
const test = require('node:test')
const { ToolPathGrantStore } = require('../src/main/tool-path-grants.cjs')

test('issues one-time sender-bound path grants', () => {
  let now = 1000
  const store = new ToolPathGrantStore({
    now: () => now,
    createId: () => 'grant-1',
    ttlMs: 5000,
  })
  const grant = store.issue('C:\\Work\\project', 7)

  assert.deepEqual(grant, { grantId: 'grant-1', path: 'C:\\Work\\project' })
  assert.throws(() => store.consume('grant-1', 8), /授权无效或已过期/)
  assert.throws(() => store.consume('grant-1', 7), /授权无效或已过期/)

  const next = store.issue('C:\\Work\\project', 7)
  assert.equal(store.consume(next.grantId, 7), 'C:\\Work\\project')
  now += 6000
  const expired = store.issue('C:\\Work\\other', 7)
  now += 6000
  assert.throws(() => store.consume(expired.grantId, 7), /授权无效或已过期/)
})
