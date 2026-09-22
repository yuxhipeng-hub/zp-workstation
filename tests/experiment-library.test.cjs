const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  ExperimentLibrary,
  inferExperimentGroup,
  resolveExperimentGroup,
  sanitizePathSegment,
} = require('../src/main/experiment-library.cjs')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')

function createLibrary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-experiments-'))
  const sourceDirectory = path.join(directory, 'source')
  const libraryDirectory = path.join(directory, 'library')
  fs.mkdirSync(sourceDirectory, { recursive: true })
  const workspace = new WorkspaceStore(path.join(directory, 'data'))
  const settings = {
    get: () => ({ experimentDir: libraryDirectory }),
  }
  return {
    directory,
    sourceDirectory,
    libraryDirectory,
    workspace,
    library: new ExperimentLibrary({ settings, workspace }),
  }
}

test('infers known and unknown experiment groups from Chinese PDF names', () => {
  assert.equal(inferExperimentGroup('算法设计与分析实验报告-张三.pdf'), '算法设计与分析实验')
  assert.equal(inferExperimentGroup('面向对象程序设计实验二.pdf'), '面向对象程序设计实验')
  assert.equal(inferExperimentGroup('计算机系统基础_实验3.pdf'), '计算机系统基础')
  assert.equal(inferExperimentGroup('数据结构实验报告1.pdf'), '数据结构')
  assert.equal(sanitizePathSegment('算法/实验:一'), '算法 实验 一')
  assert.equal(resolveExperimentGroup('数据结构实验报告.pdf', ['数据结构课程']), '数据结构课程')
  assert.equal(resolveExperimentGroup('算法设计与分析实验报告.pdf', ['算法设计']), '算法设计')
})

test('copies files into inferred group folders without moving originals', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, workspace, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const algorithm = path.join(sourceDirectory, '算法设计与分析实验报告.pdf')
  const systems = path.join(sourceDirectory, '计算机系统基础实验一.pdf')
  fs.writeFileSync(algorithm, '%PDF algorithm', 'utf8')
  fs.writeFileSync(systems, '%PDF systems', 'utf8')

  const result = await library.importEntries([algorithm, systems])
  assert.equal(result.imported, 2)
  assert.equal(result.rejected.length, 0)
  assert.equal(fs.existsSync(algorithm), true)
  assert.equal(
    fs.existsSync(path.join(libraryDirectory, '算法设计与分析实验', path.basename(algorithm))),
    true,
  )
  assert.equal(
    fs.existsSync(path.join(libraryDirectory, '计算机系统基础', path.basename(systems))),
    true,
  )
  assert.equal(workspace.get().experiments.length, 2)
})

test('accepts non-PDF course files and preserves their extensions', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, workspace, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const document = path.join(sourceDirectory, '计算机系统基础复习提纲.docx')
  const spreadsheet = path.join(sourceDirectory, '计算机系统基础实验数据.xlsx')
  fs.writeFileSync(document, 'docx placeholder', 'utf8')
  fs.writeFileSync(spreadsheet, 'xlsx placeholder', 'utf8')

  const result = await library.importEntries([document, spreadsheet])
  assert.equal(result.imported, 2)
  assert.equal(result.rejected.length, 0)
  assert.equal(workspace.get().experiments.length, 2)
  assert.equal(
    workspace
      .get()
      .experiments.every(
        (item) =>
          item.group === '计算机系统基础' &&
          fs.existsSync(item.filePath) &&
          ['.docx', '.xlsx'].includes(path.extname(item.filePath)),
      ),
    true,
  )
  assert.equal(fs.existsSync(path.join(libraryDirectory, '计算机系统基础')), true)
})

test('moves a PDF when its group is changed and removes only its metadata', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, workspace, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const source = path.join(sourceDirectory, '数据结构实验报告.pdf')
  fs.writeFileSync(source, '%PDF data structures', 'utf8')
  await library.importEntries([source])
  const experiment = workspace.get().experiments[0]

  const updated = await library.updateExperiment(experiment.id, { group: '数据结构课程' })
  const moved = updated.experiment
  assert.equal(moved.group, '数据结构课程')
  assert.equal(fs.existsSync(moved.filePath), true)
  assert.equal(
    fs.existsSync(path.join(libraryDirectory, '数据结构课程', path.basename(source))),
    true,
  )

  const nextWorkspace = library.removeExperiment(experiment.id)
  assert.equal(nextWorkspace.experiments.length, 0)
  assert.equal(fs.existsSync(moved.filePath), true)
})

test('matches an existing course folder before creating a new group', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, workspace, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const existingGroup = path.join(libraryDirectory, '数据结构课程')
  fs.mkdirSync(existingGroup, { recursive: true })
  const source = path.join(sourceDirectory, '数据结构实验报告.pdf')
  fs.writeFileSync(source, '%PDF data structures', 'utf8')

  const result = await library.importEntries([source])
  assert.equal(result.createdGroups.length, 0)
  assert.equal(workspace.get().experiments[0].group, '数据结构课程')
  assert.equal(fs.existsSync(path.join(existingGroup, path.basename(source))), true)
})

test('uses an explicitly selected existing course folder for dropped files', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, workspace, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const targetGroup = '计算机系统基础'
  fs.mkdirSync(path.join(libraryDirectory, targetGroup), { recursive: true })
  const source = path.join(sourceDirectory, '算法设计与分析实验报告.pdf')
  fs.writeFileSync(source, '%PDF explicit group', 'utf8')

  const result = await library.importEntries([{ path: source, group: targetGroup }])
  assert.equal(result.imported, 1)
  assert.equal(result.createdGroups.length, 0)
  assert.equal(workspace.get().experiments[0].group, targetGroup)
  assert.equal(fs.existsSync(path.join(libraryDirectory, targetGroup, path.basename(source))), true)
  assert.equal(fs.existsSync(path.join(libraryDirectory, '算法设计与分析实验')), false)
})

test('renames a course folder and moves every tracked PDF into it', async (t) => {
  const { directory, sourceDirectory, libraryDirectory, library } = createLibrary()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const first = path.join(sourceDirectory, '数据结构实验报告1.pdf')
  const second = path.join(sourceDirectory, '数据结构实验报告2.pdf')
  fs.writeFileSync(first, '%PDF first', 'utf8')
  fs.writeFileSync(second, '%PDF second', 'utf8')
  await library.importEntries([first, second])

  const result = await library.renameGroup('数据结构', '数据结构课程')
  assert.equal(result.renamed, 2)
  assert.equal(result.group, '数据结构课程')
  assert.equal(
    result.workspace.experiments.every((item) => item.group === '数据结构课程'),
    true,
  )
  assert.equal(
    result.workspace.experiments.every(
      (item) =>
        fs.existsSync(item.filePath) &&
        item.filePath.includes(`${path.sep}数据结构课程${path.sep}`),
    ),
    true,
  )
  assert.equal(fs.existsSync(path.join(libraryDirectory, '数据结构')), false)
  assert.equal(fs.existsSync(path.join(libraryDirectory, '数据结构课程')), true)
})
