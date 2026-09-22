const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const {
  SkillsManager,
  parseGithubSpec,
  parseSkillDocument,
  updateSkillAvailability,
} = require('../src/main/skills-manager.cjs')

test('parses DSH skill metadata and invocation flags', () => {
  const parsed = parseSkillDocument(`---
name: ui-ux-pro-max
description: "UI and UX guidance"
whenToUse: When a visual interface needs design work.
disable-model-invocation: true
user-invocable: no
---

# Skill
`)

  assert.deepEqual(parsed, {
    name: 'ui-ux-pro-max',
    description: 'UI and UX guidance',
    whenToUse: 'When a visual interface needs design work.',
    author: '',
    version: '',
    repository: '',
    permissions: [],
    dependencies: [],
    disableModelInvocation: true,
    userInvocable: false,
    metadata: {
      name: 'ui-ux-pro-max',
      description: 'UI and UX guidance',
      whenToUse: 'When a visual interface needs design work.',
      'disable-model-invocation': 'true',
      'user-invocable': 'no',
    },
  })
})

test('rejects invalid DSH frontmatter', () => {
  assert.equal(parseSkillDocument('---\nname: Bad Name\ndescription: Nope\n---\n'), null)
  assert.equal(
    parseSkillDocument('---\nname: valid-name\ndescription: Nope\nuser-invocable: maybe\n---\n'),
    null,
  )
  assert.equal(parseSkillDocument('# No frontmatter\n'), null)
})

test('lists DSH bundles, flat files, and Agent shared skills', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-skills-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))

  const dshHome = path.join(home, '.dsh')
  const agentsHome = path.join(home, '.agents')
  const dshRoot = path.join(dshHome, 'skills')
  const agentsRoot = path.join(agentsHome, 'skills')
  const bundleSkill = path.join(dshRoot, 'find-skill')
  const flatSkill = path.join(dshRoot, 'grilling.md')
  const systemSkill = path.join(dshRoot, '.system', 'ignored-skill')
  const agentSkill = path.join(agentsRoot, 'shared-skill')
  fs.mkdirSync(bundleSkill, { recursive: true })
  fs.mkdirSync(systemSkill, { recursive: true })
  fs.mkdirSync(agentSkill, { recursive: true })
  fs.writeFileSync(
    path.join(bundleSkill, 'SKILL.md'),
    '---\nname: find-skill\ndescription: Find a useful skill.\n---\n',
    'utf8',
  )
  fs.writeFileSync(
    flatSkill,
    '---\nname: grilling\ndescription: Test a plan.\ndisable-model-invocation: off\n---\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(systemSkill, 'SKILL.md'),
    '---\nname: ignored-skill\ndescription: Must not appear.\n---\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(agentSkill, 'SKILL.md'),
    '---\nname: shared-skill\ndescription: Shared with agents.\nuser-invocable: false\n---\n',
    'utf8',
  )

  const manager = new SkillsManager({ dshHome, agentsHome })
  const data = await manager.list()

  assert.deepEqual(data.counts, {
    total: 3,
    dsh: 2,
    agents: 1,
    bundled: 0,
    active: 3,
    userInvocable: 2,
    shadowed: 0,
    managed: 0,
    disabled: 0,
  })
  assert.equal(data.skillsRoot, dshRoot)
  assert.equal(data.agentsRoot, agentsRoot)
  assert.deepEqual(
    data.skills.map((skill) => skill.id),
    ['dsh:find-skill', 'dsh:grilling', 'agents:shared-skill'],
  )
  assert.equal(data.skills[0].directory, bundleSkill)
  assert.equal(data.skills[1].directory, dshRoot)
  assert.equal(data.skills[1].skillFile, flatSkill)
  assert.equal(data.skills[2].userInvocable, false)
})

test('refreshes the DSH root after settings change and prefers DSH over Agent skills', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-skills-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))

  const firstDshHome = path.join(home, 'first-dsh')
  const secondDshHome = path.join(home, 'second-dsh')
  const agentsHome = path.join(home, '.agents')
  fs.mkdirSync(path.join(firstDshHome, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(secondDshHome, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(agentsHome, 'skills', 'shared-name'), { recursive: true })
  fs.writeFileSync(
    path.join(secondDshHome, 'skills', 'shared-name.md'),
    '---\nname: shared-name\ndescription: DSH wins.\n---\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(agentsHome, 'skills', 'shared-name', 'SKILL.md'),
    '---\nname: shared-name\ndescription: Agent fallback.\n---\n',
    'utf8',
  )

  const manager = new SkillsManager({ dshHome: firstDshHome, agentsHome })
  assert.equal((await manager.list()).counts.total, 1)

  manager.setDshHome(secondDshHome)
  const data = await manager.list()
  assert.equal(data.skillsRoot, path.join(secondDshHome, 'skills'))
  assert.equal(data.counts.dsh, 1)
  assert.equal(data.counts.agents, 0)
  assert.equal(data.skills[0].description, 'DSH wins.')
  assert.equal(data.counts.shadowed, 1)
})

test('parses GitHub repository specs and rewrites Skill availability safely', () => {
  assert.deepEqual(parseGithubSpec('https://github.com/acme/skill-pack/tree/main/skills/writer'), {
    owner: 'acme',
    repo: 'skill-pack',
    ref: 'main',
    subpath: 'skills/writer',
    repository: 'acme/skill-pack',
    repositoryUrl: 'https://github.com/acme/skill-pack',
  })

  const disabled = updateSkillAvailability(
    '---\nname: writer\ndescription: Write clearly.\n---\n\n# Writer\n',
    false,
  )
  assert.match(disabled, /disable-model-invocation: true/)
  assert.match(disabled, /user-invocable: false/)
  const enabled = updateSkillAvailability(disabled, true)
  assert.doesNotMatch(enabled, /disable-model-invocation/)
  assert.doesNotMatch(enabled, /user-invocable/)
})

test('searches, installs, toggles, and checks updates for GitHub Skills', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-skills-install-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))

  const dshHome = path.join(home, '.dsh')
  const zip = new JSZip()
  zip.file(
    'skill-pack-main/skills/writer/SKILL.md',
    `---
name: writer
description: Improve academic writing.
author: Acme
version: 1.2.0
permissions: [filesystem]
dependencies: [markdown]
---

# Writer
`,
  )
  zip.file('skill-pack-main/skills/writer/helper.js', 'module.exports = true\n')
  const archiveBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  let commit = 'commit-one'
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.github.com') || url.startsWith('https://codeload.github.com')) {
      throw new Error('direct route unavailable')
    }
    if (url.includes('/search/repositories')) {
      return {
        ok: true,
        json: async () => ({
          total_count: 1,
          items: [
            {
              id: 1,
              name: 'skill-pack',
              owner: { login: 'acme' },
              full_name: 'acme/skill-pack',
              description: 'Useful skills',
              html_url: 'https://github.com/acme/skill-pack',
              stargazers_count: 42,
              updated_at: '2026-09-22T00:00:00Z',
              default_branch: 'main',
              topics: ['agent-skills'],
            },
          ],
        }),
      }
    }
    if (url.includes('codeload.github.com')) {
      return {
        ok: true,
        headers: { get: () => String(archiveBuffer.length) },
        arrayBuffer: async () =>
          archiveBuffer.buffer.slice(
            archiveBuffer.byteOffset,
            archiveBuffer.byteOffset + archiveBuffer.byteLength,
          ),
      }
    }
    if (url.includes('/commits?')) {
      return { ok: true, json: async () => [{ sha: commit }] }
    }
    return { ok: false, status: 404, text: async () => '' }
  }

  const manager = new SkillsManager({
    dshHome,
    registryFile: path.join(home, 'skill-registry.json'),
    backupRoot: path.join(home, 'skill-backups'),
    fetchImpl,
  })
  const search = await manager.searchGithub('academic')
  assert.equal(search.items[0].fullName, 'acme/skill-pack')

  const installed = await manager.installFromGithub('acme/skill-pack/skills/writer', { fetchImpl })
  assert.equal(installed.skill.name, 'writer')
  assert.equal(installed.skill.permissions[0], 'filesystem')
  assert.equal(installed.skill.managed, true)
  assert.equal(fs.existsSync(path.join(dshHome, 'skills', 'writer', 'helper.js')), true)

  const disabled = await manager.setEnabled('dsh:writer', false)
  assert.equal(disabled.skill.active, false)
  assert.equal(disabled.skill.userInvocable, false)

  commit = 'commit-two'
  const updates = await manager.checkUpdates()
  assert.equal(updates[0].updateAvailable, true)
  const updated = await manager.updateFromGithub('dsh:writer')
  assert.equal(updated.skill.active, false)
  assert.equal(updated.skill.userInvocable, false)
})
