const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(
  path.join(__dirname, '..', 'src', 'renderer', 'lib', 'drop-file.js'),
).href

async function loadModule() {
  return import(moduleUrl)
}

function createFile({ name = '虚拟资料.txt', content = '虚拟文件内容', size } = {}) {
  return {
    name,
    size: size ?? Buffer.byteLength(content),
    async arrayBuffer() {
      return new TextEncoder().encode(content).buffer
    },
  }
}

test('uses the local path supplied by the drag source without staging a copy', async () => {
  const { resolveDroppedFileSource } = await loadModule()
  let staged = 0
  const resolved = await resolveDroppedFileSource(createFile(), {
    getPathForFile: () => 'D:\\资料\\课表.xlsx',
    stageDroppedFile: async () => {
      staged += 1
      return { path: 'unused' }
    },
  })

  assert.equal(resolved, 'D:\\资料\\课表.xlsx')
  assert.equal(staged, 0)
})

test('falls back to staging content when the drag source rejects path lookup', async () => {
  const { resolveDroppedFileSource } = await loadModule()
  const staged = []
  const resolved = await resolveDroppedFileSource(createFile(), {
    getPathForFile: () => {
      throw new Error('virtual file has no path')
    },
    stageDroppedFile: async (payload) => {
      staged.push(payload)
      return { path: 'C:\\Temp\\staged.txt' }
    },
  })

  assert.equal(resolved, 'C:\\Temp\\staged.txt')
  assert.equal(staged.length, 1)
  assert.equal(staged[0].name, '虚拟资料.txt')
  assert.equal(Buffer.from(staged[0].data).toString('utf8'), '虚拟文件内容')
})

test('falls back to staging content when the drag source reports an empty path', async () => {
  const { resolveDroppedFileSource } = await loadModule()
  const resolved = await resolveDroppedFileSource(createFile(), {
    getPathForFile: () => '',
    stageDroppedFile: async () => ({ path: 'C:\\Temp\\staged.pdf' }),
  })

  assert.equal(resolved, 'C:\\Temp\\staged.pdf')
})

test('reports unreadable and empty virtual files with a local-save hint', async () => {
  const { resolveDroppedFileSource } = await loadModule()
  const unreadable = createFile()
  unreadable.arrayBuffer = async () => {
    throw new Error('delayed rendering aborted')
  }

  await assert.rejects(
    () => resolveDroppedFileSource(unreadable, { stageDroppedFile: async () => ({ path: 'x' }) }),
    /无法读取拖入文件的内容/,
  )
  await assert.rejects(
    () =>
      resolveDroppedFileSource(createFile({ content: '' }), {
        getPathForFile: () => '',
        stageDroppedFile: async () => ({ path: 'x' }),
      }),
    /拖入的文件内容为空/,
  )
})

test('rejects virtual files larger than the staged import limit', async () => {
  const { resolveDroppedFileSource } = await loadModule()
  await assert.rejects(
    () =>
      resolveDroppedFileSource(createFile({ size: 200 * 1024 * 1024 + 1 }), {
        getPathForFile: () => '',
        stageDroppedFile: async () => ({ path: 'x' }),
      }),
    /超过 200 MB/,
  )
})
