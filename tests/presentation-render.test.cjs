const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const { renderPresentationPages, findRenderTools } = require('../src/main/presentation-render.cjs')
const os = require('node:os')
const { createPresentation } = require('../src/shared/presentation.mjs')
test('PPTX rendering uses isolated paths, bounded native commands and validates every returned page', async () => {
  const deck = createPresentation(),
    calls = []
  const jpeg = await sharp({ create: { width: 128, height: 72, channels: 3, background: '#fff' } })
    .jpeg()
    .toBuffer()
  let root
  const pages = await renderPresentationPages(deck, {
    indices: [1],
    findTools: async () => ({ office: 'office', raster: 'raster' }),
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      if (command === 'office') {
        root = path.dirname(args.at(-1))
        assert.equal(path.basename(root).startsWith('zp-ppt-render-'), true)
        await fs.writeFile(path.join(root, 'deck.pdf'), 'test')
      } else await fs.writeFile(path.join(root, 'page-2.jpg'), jpeg)
    },
  })
  assert.equal(pages.length, 1)
  assert.equal(pages[0].page, 2)
  assert.equal(pages[0].pageId, deck.slides[1].id)
  assert.equal(calls[0].options.windowsHide, true)
  assert.equal(calls[0].options.timeout, 60000)
  assert.ok(calls[1].args.includes('2'))
  await assert.rejects(fs.stat(root), { code: 'ENOENT' })
})
test('missing tools and failed render do not produce a false success and scratch paths are removed', async () => {
  await assert.rejects(
    renderPresentationPages(createPresentation(), { findTools: async () => ({}) }),
    /安装/,
  )
  let root
  await assert.rejects(
    renderPresentationPages(createPresentation(), {
      findTools: async () => ({ office: 'office', raster: 'raster' }),
      run: async (_cmd, args) => {
        root = path.dirname(args.at(-1))
        throw new Error('failed')
      },
    }),
    /failed/,
  )
  await assert.rejects(fs.stat(root), { code: 'ENOENT' })
  await assert.rejects(renderPresentationPages(createPresentation(), { indices: [40] }), /1–16/)
})

test('installed portable Poppler is discovered without relying on the parent process cached PATH', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-render-discovery-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const program = path.join(root, 'Programs'),
    local = path.join(root, 'Local')
  const office = path.join(program, 'LibreOffice', 'program', 'soffice.com')
  const raster = path.join(
    local,
    'Microsoft',
    'WinGet',
    'Packages',
    'oschwartz10612.Poppler_test',
    'poppler-25.07.0',
    'Library',
    'bin',
    'pdftoppm.exe',
  )
  for (const file of [office, raster]) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'test')
  }
  assert.deepEqual(
    await findRenderTools({
      environment: { PATH: '', ProgramFiles: program, LOCALAPPDATA: local },
      userHome: root,
    }),
    { office, raster },
  )
})
