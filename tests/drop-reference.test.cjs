const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')
const {
  extractDropReferenceCandidates,
  resolveDropReferences,
  toFilesystemPath,
} = require('../src/main/drop-reference.cjs')

function createTemporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-drop-reference-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('extracts local paths from URI lists, quoted paths, and HTML drops', () => {
  const uri = pathToFileURL('C:\\资料\\高等数学 课表.xlsx').href
  const candidates = extractDropReferenceCandidates(
    `${uri}\r\n# comment\r\n"D:\\作业\\实验报告.pdf"\r\n<a href="file:///D:/课程/课表.et">课表</a>`,
  )

  assert.equal(candidates.includes(uri), true)
  assert.equal(candidates.includes('D:\\作业\\实验报告.pdf'), true)
  assert.equal(candidates.includes('file:///D:/课程/课表.et'), true)
})

test('normalizes file URLs and absolute Windows paths', () => {
  const uriPath = toFilesystemPath('file:///D:/资料/高等数学%20课表.xlsx')
  assert.equal(uriPath, path.normalize('D:\\资料\\高等数学 课表.xlsx'))
  assert.equal(
    toFilesystemPath('"C:\\Users\\小zp\\Documents\\课表.xlsx"'),
    path.normalize('C:\\Users\\小zp\\Documents\\课表.xlsx'),
  )
  assert.equal(toFilesystemPath('relative\\课表.xlsx'), '')
})

test('resolves only existing local files and removes duplicate references', async (t) => {
  const directory = createTemporaryDirectory(t)
  const filePath = path.join(directory, '课表.xlsx')
  fs.writeFileSync(filePath, 'placeholder', 'utf8')
  const uri = pathToFileURL(filePath).href
  const missing = path.join(directory, '不存在.xlsx')

  const resolved = await resolveDropReferences([`${uri}\r\n${filePath}`, missing, '文件名.xlsx'])

  assert.deepEqual(resolved, [
    {
      path: path.resolve(filePath),
      name: '课表.xlsx',
      size: 11,
    },
  ])
})
