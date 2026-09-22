const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { BackupManager } = require('../src/main/backup-manager.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')

function createHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-backup-'))
  const userDataDir = path.join(root, 'user-data')
  const dshHome = path.join(root, '.dsh')
  const experimentDir = path.join(root, '资料')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(dshHome, { recursive: true })
  fs.mkdirSync(experimentDir, { recursive: true })

  const settings = new SettingsStore(userDataDir)
  settings.patch({ experimentDir, dshHome })
  const workspace = new WorkspaceStore(userDataDir)
  const registryFile = path.join(userDataDir, 'skill-registry.json')
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`safe:${value}`, 'utf8'),
    decryptString: (value) => value.toString('utf8').replace(/^safe:/, ''),
  }
  const backups = new BackupManager({
    userDataDir,
    appVersion: '0.3.4',
    settings,
    workspace,
    dshHomeProvider: () => dshHome,
    skillRegistryFile: registryFile,
    safeStorage,
  })
  return {
    root,
    userDataDir,
    dshHome,
    experimentDir,
    settings,
    workspace,
    registryFile,
    backups,
    safeStorage,
  }
}

test('creates encrypted archives, includes materials, and restores workspace data', async (t) => {
  const harness = createHarness()
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  harness.workspace.createAssignment({ title: '备份前作业', course: '算法设计与分析' })
  const material = path.join(harness.experimentDir, '算法实验', '报告.pdf')
  fs.mkdirSync(path.dirname(material), { recursive: true })
  fs.writeFileSync(material, 'fixture')
  harness.workspace.addExperiments([
    {
      id: 'experiment-1',
      title: '实验报告',
      originalName: '报告.pdf',
      filePath: material,
      group: '算法实验',
      size: 7,
    },
  ])
  fs.mkdirSync(path.join(harness.dshHome, 'skills', 'writer'), { recursive: true })
  fs.writeFileSync(
    path.join(harness.dshHome, 'skills', 'writer', 'SKILL.md'),
    '---\nname: writer\ndescription: Write.\n---\n',
  )
  fs.writeFileSync(
    harness.registryFile,
    JSON.stringify({ version: 1, skills: { writer: { name: 'writer' } } }),
  )

  const archive = await harness.backups.createArchive({
    label: 'manual',
    includeMaterials: true,
    password: 'correct-password',
  })
  assert.equal(archive.encrypted, true)
  assert.equal(archive.summary.assignments, 1)
  assert.equal(archive.includeMaterials, true)

  harness.workspace.createAssignment({ title: '备份后作业', course: '大学英语' })
  await assert.rejects(
    () => harness.backups.restoreArchive(archive.fileName, 'wrong-password'),
    /密码错误/,
  )
  const restored = await harness.backups.restoreArchive(archive.fileName, 'correct-password')
  assert.equal(restored.workspace.assignments.length, 1)
  assert.equal(restored.workspace.assignments[0].title, '备份前作业')
  assert.equal(restored.workspace.experiments[0].filePath, material)
})

test('uploads to and downloads from a local sync folder with encrypted sync archives', async (t) => {
  const harness = createHarness()
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))
  const syncDir = path.join(harness.root, 'OneDrive', 'ZP Workbench')

  harness.settings.patch({
    syncProvider: 'local',
    syncLocalDir: syncDir,
  })
  harness.backups.setSecret('syncPassword', 'sync-password')
  const result = await harness.backups.testSyncTarget()
  assert.equal(result.provider, 'local')

  harness.workspace.createAssignment({ title: '同步前作业', course: '高等数学' })
  const uploaded = await harness.backups.uploadLatest()
  assert.equal(fs.existsSync(path.join(syncDir, uploaded.fileName)), true)

  harness.workspace.createAssignment({ title: '同步后作业', course: '大学物理' })
  const restored = await harness.backups.downloadLatest()
  assert.equal(restored.workspace.assignments.length, 1)
  assert.equal(restored.workspace.assignments[0].title, '同步前作业')
})

test('restores an encrypted sync archive on a second machine with the same sync password', async (t) => {
  const harness = createHarness()
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))
  const syncDir = path.join(harness.root, 'OneDrive', 'ZP Workbench')
  harness.settings.patch({ syncProvider: 'local', syncLocalDir: syncDir })

  await assert.rejects(() => harness.backups.uploadLatest(), /同步密码/)
  harness.backups.setSecret('syncPassword', 'cross-device-password')
  harness.workspace.createAssignment({ title: '跨电脑恢复', course: '软件工程' })
  await harness.backups.uploadLatest()

  const secondRoot = path.join(harness.root, 'second-machine')
  const secondUserData = path.join(secondRoot, 'user-data')
  const secondExperimentDir = path.join(secondRoot, '资料')
  const secondDshHome = path.join(secondRoot, '.dsh')
  fs.mkdirSync(secondUserData, { recursive: true })
  fs.mkdirSync(secondExperimentDir, { recursive: true })
  fs.mkdirSync(secondDshHome, { recursive: true })
  const secondSettings = new SettingsStore(secondUserData)
  secondSettings.patch({
    experimentDir: secondExperimentDir,
    dshHome: secondDshHome,
    syncProvider: 'local',
    syncLocalDir: syncDir,
  })
  const secondWorkspace = new WorkspaceStore(secondUserData)
  const secondBackups = new BackupManager({
    userDataDir: secondUserData,
    appVersion: '0.3.4',
    settings: secondSettings,
    workspace: secondWorkspace,
    dshHomeProvider: () => secondDshHome,
    skillRegistryFile: path.join(secondUserData, 'skill-registry.json'),
    safeStorage: harness.safeStorage,
  })
  secondBackups.setSecret('syncPassword', 'cross-device-password')

  const restored = await secondBackups.downloadLatest()
  assert.equal(restored.workspace.assignments[0].title, '跨电脑恢复')
  assert.equal(restored.settings.experimentDir, secondExperimentDir)
  assert.equal(restored.settings.dshHome, secondDshHome)
})
