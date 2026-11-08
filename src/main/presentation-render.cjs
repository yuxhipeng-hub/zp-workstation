const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const { presentationBuffer } = require('./presentation-export.cjs')
const { validateImageData } = require('../shared/presentation-canvas.mjs')
const execute = promisify(execFile)

async function findRenderTools({ environment = process.env, userHome = os.homedir() } = {}) {
  const roots = (environment.PATH || '')
    .split(path.delimiter)
    .filter((root) => root && path.isAbsolute(root))
  const program = environment.ProgramFiles || 'C:\\Program Files'
  const portable = []
  for (const base of new Set(
    [
      environment.LOCALAPPDATA,
      path.join(userHome, 'AppData', 'Local'),
      path.join(program, 'WinGet'),
    ].filter(Boolean),
  )) {
    const packages = base.endsWith(`${path.sep}WinGet`)
      ? path.join(base, 'Packages')
      : path.join(base, 'Microsoft', 'WinGet', 'Packages')
    try {
      for (const name of (await fs.readdir(packages)).filter((name) =>
        name.startsWith('oschwartz10612.Poppler_'),
      )) {
        for (const version of (await fs.readdir(path.join(packages, name))).filter((name) =>
          name.startsWith('poppler-'),
        ))
          portable.push(path.join(packages, name, version, 'Library', 'bin', 'pdftoppm.exe'))
      }
    } catch {
      /* 未通过 WinGet 安装时继续查找 PATH */
    }
  }
  const locate = async (candidates) => {
    for (const candidate of candidates) {
      try {
        if ((await fs.stat(candidate)).isFile()) return candidate
      } catch {
        /* 继续查找已安装工具 */
      }
    }
    return null
  }
  return {
    office: await locate([
      path.join(program, 'LibreOffice', 'program', 'soffice.com'),
      ...roots.map((r) =>
        path.join(r, process.platform === 'win32' ? 'soffice.com' : 'libreoffice'),
      ),
    ]),
    raster: await locate([
      ...portable,
      path.join(program, 'WinGet', 'Links', 'pdftoppm.exe'),
      path.join(
        environment.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local'),
        'Microsoft',
        'WinGet',
        'Links',
        'pdftoppm.exe',
      ),
      ...roots.map((r) => path.join(r, process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm')),
    ]),
  }
}
async function renderPresentationPages(
  deck,
  { indices = deck.slides.map((_, i) => i), findTools = findRenderTools, run = execute } = {},
) {
  if (
    !indices.length ||
    indices.length > 16 ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= deck.slides.length)
  )
    throw new Error('每次视觉检查请选择 1–16 页。')
  const tools = await findTools()
  if (!tools.office || !tools.raster) throw new Error('页面渲染需要安装 LibreOffice 与 Poppler。')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-ppt-render-'))
  try {
    const source = path.join(root, 'deck.pptx')
    await fs.writeFile(source, await presentationBuffer(deck))
    const options = { windowsHide: true, timeout: 60000, maxBuffer: 128 * 1024 }
    await run(
      tools.office,
      [
        `-env:UserInstallation=${pathToFileURL(path.join(root, 'office-profile')).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        root,
        source,
      ],
      options,
    )
    await fs.access(path.join(root, 'deck.pdf'))
    await run(
      tools.raster,
      [
        '-f',
        String(Math.min(...indices) + 1),
        '-l',
        String(Math.max(...indices) + 1),
        '-scale-to',
        '1280',
        '-jpeg',
        '-jpegopt',
        'quality=85',
        path.join(root, 'deck.pdf'),
        path.join(root, 'page'),
      ],
      options,
    )
    const files = (await fs.readdir(root)).filter((f) => /^page-\d+\.jpg$/.test(f))
    const pages = []
    for (const index of indices) {
      const file = files.find((f) => Number(/^page-(\d+)/.exec(f)[1]) === index + 1)
      if (!file) throw new Error('渲染页面不完整，未标记检查通过。')
      const bytes = await fs.readFile(path.join(root, file))
      const data = validateImageData(`data:image/jpeg;base64,${bytes.toString('base64')}`)
      pages.push({ pageId: deck.slides[index].id, page: index + 1, data })
    }
    return pages
  } finally {
    if (
      path.dirname(root) === path.resolve(os.tmpdir()) &&
      path.basename(root).startsWith('zp-ppt-render-')
    )
      await fs.rm(root, { recursive: true, force: true })
  }
}
module.exports = { findRenderTools, renderPresentationPages }
