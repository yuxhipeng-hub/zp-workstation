const test = require('node:test')
const assert = require('node:assert/strict')
const { createCreationPreview } = require('../src/renderer/creation-preview.js')

test('browser creation examples stay in memory and reject desktop operations', async () => {
  const workspace = {}
  let id = 0
  const api = createCreationPreview(workspace, structuredClone, () => `preview-${++id}`)
  const example = structuredClone(workspace.creationProjects.find((x) => x.artifacts.length))
  const media = await api.creationPreview(example.id, example.artifacts[0].id)
  assert.match(media.url, /^data:image\/svg\+xml/)
  const result = await api.creationCommand({ action: 'create', name: '  新项目  ' })
  assert.equal(result.creationProjects[0].name, '新项目')
  result.creationProjects[0].name = '不能修改内存源'
  assert.equal(workspace.creationProjects[0].name, '新项目')
  await assert.rejects(api.creationImport(example.id), /桌面应用/)
  await assert.rejects(api.creationVideoSubmit(example.id), /桌面应用/)
  await assert.rejects(api.creationCommand({ action: 'create', name: '  ' }), /项目名称/)
  assert.deepEqual(
    workspace.creationProjects.find((x) => x.id === example.id),
    example,
  )
  const independent = {}
  createCreationPreview(independent, structuredClone, () => `preview-${++id}`)
  assert.equal(independent.creationProjects.length, 3)
  assert.equal(
    independent.creationProjects.filter((x) => x.parentId === independent.creationProjects[0].id)
      .length,
    2,
  )
})
