const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanProject } = require('../src/main/creation-schema.cjs')
const {
  creationStepNodes,
  renderCreationStepTree,
} = require('../src/renderer/components/creation-step-tree.js')
const e = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const options = {
  escapeHtml: e,
  preview: (_p, a) => `<figure data-preview="${e(a.id)}">${e(a.label)}</figure>`,
}
const project = () =>
  cleanProject({
    id: 'video',
    name: '视频',
    video: {
      schemaVersion: 1,
      content: {
        brief: { idea: '真实创意' },
        story: '真实故事',
        shots: [
          {
            id: 'one',
            purpose: '镜头一',
            story: '真实镜头',
            prompt: { action: '真实提示词' },
            firstFrame: 'frame',
          },
        ],
      },
    },
    artifacts: [
      { id: 'frame', type: 'image', label: '首帧', family: '图片' },
      { id: 'unbound', type: 'image', label: '未关联图片', family: '图片' },
    ],
  })

test('all seven steps provide collapsed reading nodes and secondary editing without forms', () => {
  const p = project()
  const expected = {
    story: ['创作简报', '故事正文'],
    shots: ['镜头 01 · 镜头一'],
    design: ['画风与色表', '角色设定', '场景设定', '道具设定', '首尾帧'],
    audit: ['审核结论', '待处理问题'],
    generate: ['镜头任务', '生成结果'],
    edit: ['剪辑', '声音与字幕', '成片'],
    works: ['成片预览', '修改意见', '验收结果'],
  }
  for (const [step, labels] of Object.entries(expected)) {
    assert.deepEqual(
      creationStepNodes(p, step, options).map((n) => n.label),
      labels,
    )
    const html = renderCreationStepTree(p, step, options, new Set())
    assert.doesNotMatch(html, /<input|<textarea|<select|cc-function-content|data-preview=/)
    assert.match(html, /aria-expanded="false"/)
    const depth = (nodes) =>
      Math.max(0, ...nodes.map((n) => 1 + (n.children ? depth(n.children) : 0)))
    assert.ok(depth(creationStepNodes(p, step, options)) <= 2)
  }
})

test('reading leaves show only their real content, isolate shots and never borrow unrelated media', () => {
  const p = project()
  p.video.content.shots.push({
    ...p.video.content.shots[0],
    id: 'two',
    purpose: '镜头二',
    story: '第二镜头内容',
  })
  const open = new Set(['video:shots:shot:one', 'video:shots:shot-content:one'])
  const shot = renderCreationStepTree(p, 'shots', options, open)
  assert.match(shot, /真实镜头/)
  assert.doesNotMatch(shot, /真实提示词|第二镜头内容|真实故事/)
  const frames = renderCreationStepTree(
    p,
    'design',
    options,
    new Set(['video:design:frames', 'video:design:frames:one']),
  )
  assert.match(frames, /data-preview="frame"/)
  assert.doesNotMatch(frames, /data-preview="unbound"/)
})

test('reading content escapes markup and marks stale audit conclusions', () => {
  const p = project()
  p.video.content.story = '<img src=x onerror=alert(1)>'
  const html = renderCreationStepTree(p, 'story', options, new Set(['video:story:story']))
  assert.match(html, /&lt;img/)
  assert.doesNotMatch(html, /<img/)
  p.video.audits.push({ shotId: 'one', status: 'pass', summary: '旧结论', checks: [] })
  const audit = creationStepNodes(p, 'audit', {
    ...options,
    data: { video: p.video, audits: [{ shotId: 'one', status: 'stale' }] },
  })[0].html
  assert.match(audit, /已失效/)
  assert.doesNotMatch(audit, /· 通过/)
})
