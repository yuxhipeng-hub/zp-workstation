const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const rootDir = path.join(__dirname, '..')
const moduleUrl = pathToFileURL(path.join(rootDir, 'scripts', 'sync-obsidian-vault.mjs')).href
const loadModule = () => import(moduleUrl)

test('rewrites repository document paths into wikilinks', async () => {
  const { rewriteLinks } = await loadModule()
  const targets = new Map([
    ['docs/HANDOFF.md', '交接说明'],
    ['docs/DECISIONS.md', '决策记录'],
    ['RELEASE.md', '发布与更新'],
  ])

  const body = [
    '先读 `docs/HANDOFF.md`，纠结原因时读 `docs/DECISIONS.md`。',
    '版本号在 `package.json`。',
    '- [发布与更新](RELEASE.md)',
    '',
    '```',
    'node --test docs/HANDOFF.md',
    '```',
  ].join('\n')

  const rewritten = rewriteLinks(body, 'docs/DEVELOPMENT_FRAMEWORK.md', targets)
  assert.match(rewritten, /先读 \[\[交接说明\]\]，纠结原因时读 \[\[决策记录\]\]。/)
  assert.match(rewritten, /版本号在 `package\.json`。/)
  assert.match(rewritten, /- \[\[发布与更新\]\]/)
  assert.match(rewritten, /```\nnode --test docs\/HANDOFF\.md\n```/)
})

test('resolves document paths relative to the source file', async () => {
  const { rewriteLinks } = await loadModule()
  const targets = new Map([['docs/specs/README.md', '规格模板']])

  const rewritten = rewriteLinks('见 `README.md`。', 'docs/specs/README.md', targets)
  assert.equal(rewritten, '见 [[规格模板]]。')
})

test('keeps markdown link labels when they differ from the note name', async () => {
  const { rewriteLinks } = await loadModule()
  const targets = new Map([['docs/DESIGN_SYSTEM.md', '设计系统（中文）']])

  const rewritten = rewriteLinks('- [视觉规范](docs/DESIGN_SYSTEM.md)', 'README.md', targets)
  assert.equal(rewritten, '- [[设计系统（中文）|视觉规范]]')
})

test('does not nest wikilinks when a markdown link label is a code path', async () => {
  const { rewriteLinks } = await loadModule()
  const targets = new Map([['docs/DSH_HANDOFF.md', 'DSH 接手手册']])

  const rewritten = rewriteLinks(
    '见 [`docs/DSH_HANDOFF.md`](docs/DSH_HANDOFF.md)。',
    'docs/HANDOFF.md',
    targets,
  )
  assert.equal(rewritten, '见 [[DSH 接手手册]]。')
})

test('extracts a level-two section from a document', async () => {
  const { extractSection } = await loadModule()
  const text = [
    '# 标题',
    '',
    '## 上次改动',
    '',
    '| 日期 | 内容 |',
    '',
    '## 待办 / 已知问题',
    '',
    '- 事项',
  ].join('\n')

  assert.equal(extractSection(text, '## 上次改动'), '| 日期 | 内容 |')
  assert.equal(extractSection(text, '## 待办 / 已知问题'), '- 事项')
  assert.equal(extractSection(text, '## 不存在的标题'), null)
})

test('builds frontmatter that Obsidian can read back', async () => {
  const { buildFrontmatter, splitFrontmatter, quoteYaml } = await loadModule()
  const frontmatter = buildFrontmatter({
    title: '交接说明',
    category: '产品',
    description: '当前状态：版本、分支、待办',
    tags: ['zp-workbench', 'zp/产品'],
    source: 'docs/HANDOFF.md',
    updated: '2026-10-15',
  })

  assert.match(frontmatter, /^---\n/)
  assert.match(frontmatter, /title: "交接说明"/)
  assert.match(frontmatter, /description: "当前状态：版本、分支、待办"/)
  assert.match(frontmatter, / {2}- "zp\/产品"/)
  assert.match(frontmatter, /generated: true\n---$/)
  assert.equal(quoteYaml('带"引号"的值'), '"带\\"引号\\"的值"')

  const roundTrip = splitFrontmatter(`${frontmatter}\n\n正文\n`)
  assert.equal(roundTrip.body.trim(), '正文')
})

test('keeps the source frontmatter and replaces its heading', async () => {
  const { splitFrontmatter, normalizeHeading } = await loadModule()
  const text = ['---', 'name: Raycast design reference', '---', '', '# 旧标题', '', '正文'].join(
    '\n',
  )
  const { frontmatter, body } = splitFrontmatter(text)

  assert.equal(frontmatter, 'name: Raycast design reference')
  assert.equal(normalizeHeading(body, 'Raycast 参考'), '# Raycast 参考\n\n正文\n')
})

test('every mirrored source file still exists', async () => {
  const { MIRROR_NOTES, SECTION_NOTES, LOCAL_NOTES } = await loadModule()
  for (const entry of [...MIRROR_NOTES, ...SECTION_NOTES, ...LOCAL_NOTES]) {
    assert.equal(
      fs.existsSync(path.join(rootDir, entry.source)),
      true,
      `缺少源文件：${entry.source}`,
    )
  }
})

test('every repository document is mirrored or registered as a local note', async () => {
  const { MIRROR_NOTES, LOCAL_NOTES } = await loadModule()
  const registered = new Set([...MIRROR_NOTES, ...LOCAL_NOTES].map((entry) => entry.source))

  const collect = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) return collect(absolute)
      if (!entry.name.endsWith('.md')) return []
      return [path.relative(rootDir, absolute).split(path.sep).join('/')]
    })

  const rootDocuments = fs.readdirSync(rootDir).filter((name) => name.endsWith('.md'))
  const documents = [...rootDocuments, ...collect(path.join(rootDir, 'docs'))].sort()
  const unregistered = documents.filter((document) => !registered.has(document))

  assert.deepEqual(
    unregistered,
    [],
    `以下文档还没登记到 scripts/sync-obsidian-vault.mjs，Obsidian 会漏掉它们：\n${unregistered.join('\n')}`,
  )
})

test('mirrors the DSH handoff into the engineering folder', async () => {
  const { MIRROR_NOTES } = await loadModule()
  const note = MIRROR_NOTES.find((entry) => entry.source === 'docs/DSH_HANDOFF.md')

  assert.equal(note?.note, '20 工程/DSH 接手手册.md')
  assert.equal(note?.title, 'DSH 接手手册')
  assert.equal(note?.category, '工程')
})

test('vault note names and folder structure stay unique', async () => {
  const { MIRROR_NOTES, SECTION_NOTES, LOCAL_NOTES, PROJECT_FOLDER } = await loadModule()
  const notes = [...MIRROR_NOTES, ...SECTION_NOTES, ...LOCAL_NOTES].map((entry) => entry.note)
  assert.equal(new Set(notes).size, notes.length)
  for (const note of notes) {
    assert.match(note, /^\d{2}\s|^[^/]+\.md$/)
    assert.ok(!note.startsWith('../'))
    assert.ok(!path.isAbsolute(note))
  }
  assert.equal(PROJECT_FOLDER, 'ZP Workbench')
})

test('generated canvas is valid JSON Canvas', async () => {
  const { buildCanvas, PROJECT_FOLDER } = await loadModule()
  const canvas = buildCanvas([
    {
      name: '产品',
      nodes: [{ title: '交接说明', file: `${PROJECT_FOLDER}/10 产品/交接说明.md` }],
    },
    {
      name: '工程',
      nodes: [{ title: '开发框架', file: `${PROJECT_FOLDER}/20 工程/开发框架.md` }],
    },
  ])
  const parsed = JSON.parse(JSON.stringify(canvas))
  const ids = new Set(parsed.nodes.map((node) => node.id))

  assert.equal(ids.size, parsed.nodes.length)
  for (const node of parsed.nodes) {
    assert.ok(['text', 'file', 'group'].includes(node.type))
    assert.equal(Number.isFinite(node.width) && node.width > 0, true)
    assert.equal(Number.isFinite(node.height) && node.height > 0, true)
    if (node.type === 'file') assert.ok(node.file.startsWith(`${PROJECT_FOLDER}/`))
  }
  for (const edge of parsed.edges) {
    assert.ok(ids.has(edge.fromNode))
    assert.ok(ids.has(edge.toNode))
  }
})

test('base file filters on the sync tag and groups by category', async () => {
  const { buildBase } = await loadModule()
  const base = buildBase()

  assert.match(base, /file\.hasTag\("zp-workbench"\)/)
  assert.match(base, /groupBy:\s*\n\s*property: category/)
  assert.match(base, /- type: table/)
})

test('normalizes the sync timestamp before comparing notes', async () => {
  const { normalizeSyncTime } = await loadModule()

  assert.equal(
    normalizeSyncTime('> 内容更新：2026-10-15 · 同步时间：2026-10-15 22:00'),
    '> 内容更新：2026-10-15 · 同步时间：<sync>',
  )
  assert.equal(normalizeSyncTime('- 上次同步：2026-10-15 22:00'), '- 上次同步：<sync>')
})

test('inspection passes right after a sync and catches notes that drift', async () => {
  const { checkVault, syncVault } = await loadModule()
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-vault-'))
  syncVault({ vaultPath, syncTime: '2026-10-15 22:00' })

  const fresh = checkVault({ vaultPath, syncTime: '2026-10-15 23:59' })
  assert.equal(fresh.upToDate, true, fresh.outdated.join('、'))
  assert.ok(fresh.checked > 10)

  const notePath = path.join(vaultPath, 'ZP Workbench', '10 产品', '交接说明.md')
  fs.appendFileSync(notePath, '\n手写加的一行\n')
  const drifted = checkVault({ vaultPath, syncTime: '2026-10-15 22:00' })
  assert.equal(drifted.upToDate, false)
  assert.deepEqual(drifted.outdated, ['10 产品/交接说明.md'])
})

test('inspection reports missing and leftover generated notes', async () => {
  const { checkVault } = await loadModule()
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-vault-'))
  const projectDir = path.join(vaultPath, 'ZP Workbench')

  const empty = checkVault({ vaultPath, syncTime: '2026-10-15 22:00' })
  assert.equal(empty.upToDate, false)
  assert.ok(empty.missing.includes('10 产品/交接说明.md'))

  fs.mkdirSync(path.join(projectDir, '10 产品'), { recursive: true })
  fs.writeFileSync(
    path.join(projectDir, '10 产品', '早就删掉的页面.md'),
    '---\ngenerated: true\n---\n\n正文\n',
    'utf8',
  )
  const withLeftover = checkVault({ vaultPath, syncTime: '2026-10-15 22:00' })
  assert.deepEqual(withLeftover.stale, ['10 产品/早就删掉的页面.md'])
})
