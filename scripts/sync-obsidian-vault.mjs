import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Obsidian 里的项目文件夹名，脚本只在这层目录内写入和清理。 */
export const PROJECT_FOLDER = 'ZP Workbench'
export const SYNC_TAG = 'zp-workbench'
export const SYNC_COMMAND = 'npm run sync:vault'

/** 仓库文档逐份镜像到 vault。 */
export const MIRROR_NOTES = [
  {
    source: 'README.md',
    note: '10 产品/项目说明（README）.md',
    title: '项目说明（README）',
    category: '产品',
    description: '仓库 README：定位、核心能力、目录结构与发布原则',
  },
  {
    source: 'docs/HANDOFF.md',
    note: '10 产品/交接说明.md',
    title: '交接说明',
    category: '产品',
    description: '当前状态、上次改动、待办与已知问题；每条线程收尾更新',
  },
  {
    source: 'docs/DSH_HANDOFF.md',
    note: '20 工程/DSH 接手手册.md',
    title: 'DSH 接手手册',
    category: '工程',
    description: 'DSH 开发环境、架构边界、数据红线、测试矩阵与首次接手检查表',
  },
  {
    source: 'docs/DECISIONS.md',
    note: '40 决策/决策记录.md',
    title: '决策记录',
    category: '决策',
    description: '记录「以后可能会被问为什么」的决定，最新的在最上面',
  },
  {
    source: 'AGENTS.md',
    note: '20 工程/仓库约定.md',
    title: '仓库约定',
    category: '工程',
    description: '给编码代理的开工顺序、改动要求与上下文纪律',
  },
  {
    source: 'docs/DEVELOPMENT_FRAMEWORK.md',
    note: '20 工程/开发框架.md',
    title: '开发框架',
    category: '工程',
    description: '分支模型、架构边界、数据迁移、测试体系与质量门禁',
  },
  {
    source: 'docs/CONTEXT-AND-COST.md',
    note: '20 工程/上下文与成本.md',
    title: '上下文与成本',
    category: '工程',
    description: '长线程的实测开销数据、根因与日常纪律',
  },
  {
    source: 'docs/TECH_DEBT.md',
    note: '20 工程/技术债清单.md',
    title: '技术债清单',
    category: '工程',
    description: '按优先级排列的技术债、验收标准与推进规则',
  },
  {
    source: 'RELEASE.md',
    note: '20 工程/发布与更新.md',
    title: '发布与更新',
    category: '工程',
    description: '更新架构、Actions 自动发布、更新清单与线路配置',
  },
  {
    source: 'docs/DESIGN_SYSTEM.md',
    note: '30 设计/设计系统（中文）.md',
    title: '设计系统（中文）',
    category: '设计',
    description: '主题、颜色、字体、控件、动效与可访问性规范',
  },
  {
    source: 'DESIGN.md',
    note: '30 设计/设计系统（英文）.md',
    title: '设计系统（英文）',
    category: '设计',
    description: '英文版设计规范：方向、材料、图标、页面骨架与迁移状态',
  },
  {
    source: 'docs/RAYCAST_DESIGN_REFERENCE.md',
    note: '30 设计/Raycast 参考.md',
    title: 'Raycast 参考',
    category: '设计',
    description: '外部品牌设计样本，只作参考，不是本项目的实现规范',
  },
  {
    source: 'docs/specs/README.md',
    note: '50 规格/规格模板.md',
    title: '规格模板',
    category: '规格',
    description: '新功能规格文件的模板与写法说明',
  },
  {
    source: 'docs/specs/001-local-app-hosting-and-desktop-agents.md',
    note: '50 规格/001 本机应用托管与桌面智能体.md',
    title: '001 本机应用托管与桌面智能体',
    category: '规格',
    description: '已停止方向的历史规格，保留作为背景资料',
  },
]

/** 从仓库文档里抽一段出来单独成篇。 */
export const SECTION_NOTES = [
  {
    source: 'docs/HANDOFF.md',
    heading: '## 上次改动',
    note: '10 产品/变更时间线.md',
    title: '变更时间线',
    category: '产品',
    description: '按时间倒序的改动记录，来自交接说明的「上次改动」表',
  },
  {
    source: 'docs/HANDOFF.md',
    heading: '## 待办 / 已知问题',
    note: '10 产品/待办与已知问题.md',
    title: '待办与已知问题',
    category: '产品',
    description: '还没做完的事和已知缺陷，来自交接说明的待办段',
  },
]

/** 手写笔记，正文放在仓库 docs/vault/，同步时原样搬进 vault。 */
export const LOCAL_NOTES = [
  {
    source: 'docs/vault/首页.md',
    note: 'ZP Workbench.md',
    title: 'ZP Workbench',
    category: '索引',
    description: '知识库首页：项目一句话、当前状态与入口',
  },
  {
    source: 'docs/vault/文档地图.md',
    note: '00 索引/文档地图.md',
    title: '文档地图',
    category: '索引',
    description: 'vault 结构、阅读路径与全部文档总表',
  },
  {
    source: 'docs/vault/产品方向.md',
    note: '10 产品/产品方向.md',
    title: '产品方向',
    category: '产品',
    description: '定位、目标用户、能力边界与和 DSH 的分工',
  },
]

const CANVAS_GROUPS = ['产品', '工程', '设计', '决策', '规格']

export function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) continue
    const next = argv[index + 1]
    values[key.slice(2)] = next && !next.startsWith('--') ? next : true
    if (values[key.slice(2)] !== true) index += 1
  }
  return values
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** YAML 里所有文本都加引号，避免中文标点和路径里的特殊字符被解析坏。 */
export function quoteYaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildFrontmatter({ title, category, description, tags, source, updated }) {
  const lines = ['---', `title: ${quoteYaml(title)}`]
  if (description) lines.push(`description: ${quoteYaml(description)}`)
  lines.push(`category: ${quoteYaml(category)}`)
  lines.push('tags:')
  for (const tag of tags) lines.push(`  - ${quoteYaml(tag)}`)
  lines.push(`source: ${quoteYaml(source)}`)
  lines.push(`updated: ${quoteYaml(updated)}`)
  lines.push('generated: true')
  lines.push('---')
  return lines.join('\n')
}

/** 拆出源文件顶部的 frontmatter，正文单独返回。 */
export function splitFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { frontmatter: '', body: normalized }
  const lines = normalized.split('\n')
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end === -1) return { frontmatter: '', body: normalized }
  const frontmatter = lines.slice(1, end).join('\n')
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '')
  return { frontmatter, body }
}

/** 源文档自己的 H1 换成笔记标题，避免标题和笔记名对不上。 */
export function normalizeHeading(body, title) {
  const stripped = body.replace(/^\s*#\s+[^\n]*\n+/, '')
  return `# ${title}\n\n${stripped.trim()}\n`
}

function createLinkResolver(currentSource, targets) {
  const directory = path.posix.dirname(currentSource)
  return (raw) => {
    const target = raw.trim().replace(/^\.\//, '')
    if (!target || target.startsWith('#') || target.includes('://')) return null
    for (const candidate of [target, path.posix.normalize(path.posix.join(directory, target))]) {
      if (targets.has(candidate)) return targets.get(candidate)
    }
    return null
  }
}

/**
 * 把仓库文档里指向其他文档的相对路径改成 wikilink，
 * 代码块里的内容不动，指向源码和测试文件的路径也不动。
 */
export function rewriteLinks(body, currentSource, targets) {
  const resolve = createLinkResolver(currentSource, targets)
  const lines = body.split('\n')
  let fence = null
  return lines
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/)
      if (marker) {
        if (fence === null) {
          fence = marker[1][0]
        } else if (marker[1][0] === fence) {
          fence = null
        }
        return line
      }
      if (fence !== null) return line

      return line.replace(
        /\[([^\]\n]+)\]\(([^)\s]+\.md)\)|`([^`\n]+)`/g,
        (match, text, target, code) => {
          if (target) {
            const note = resolve(target)
            if (!note) return match
            const label = text.trim()
            const codeLabel = label.match(/^`([^`]+)`$/)
            if (label === note || (codeLabel && resolve(codeLabel[1]) === note)) {
              return `[[${note}]]`
            }
            return `[[${note}|${text}]]`
          }
          const note = resolve(code)
          return note ? `[[${note}]]` : match
        },
      )
    })
    .join('\n')
}

/** 取出某个二级标题下的正文，用于把交接说明拆成时间线和待办两篇。 */
export function extractSection(text, heading) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return null
  let end = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  if (end === -1) end = lines.length
  const section = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
  return section || null
}

export function buildCallout({ source, label, updated, syncTime }) {
  return [
    '> [!info] 由仓库同步生成',
    `> 源文件：${source}${label ? `（${label}）` : ''}`,
    `> 内容更新：${updated} · 同步时间：${syncTime}`,
    `> 要改内容请改仓库文件，然后运行 \`${SYNC_COMMAND}\`；在本页直接编辑会在下次同步被覆盖。`,
  ].join('\n')
}

export function hashId(key) {
  return createHash('sha1').update(key).digest('hex').slice(0, 16)
}

/**
 * 同步时间会写进便签正文。比对"vault 是否落后于仓库"时先把它抹平，
 * 否则每次重跑同步都会被判成内容有变化。
 */
export function normalizeSyncTime(text) {
  return String(text)
    .replace(/(同步时间：)[^\n]*/g, '$1<sync>')
    .replace(/(上次同步：)[^\n]*/g, '$1<sync>')
}

/** 生成资料关系画布：左侧总览，右侧按分类分列。 */
export function buildCanvas(groups) {
  const nodes = []
  const edges = []
  const columnGap = 460
  const rowHeight = 130

  const hubId = hashId('hub')
  nodes.push({
    id: hubId,
    type: 'text',
    x: -560,
    y: 40,
    width: 380,
    height: 300,
    color: '6',
    text: [
      '# ZP Workbench',
      '',
      '课程与学习数据工作台的知识库总览。',
      '',
      '- [[文档地图]]',
      '- [[交接说明]]',
      '- [[待办与已知问题]]',
      '- [[产品方向]]',
      '',
      '每篇笔记都由仓库同步生成，箭头只是分类归属。',
    ].join('\n'),
  })

  groups.forEach((group, column) => {
    const groupX = column * columnGap
    const groupId = hashId(`group:${group.name}`)
    const height = 90 + group.nodes.length * rowHeight
    nodes.push({
      id: groupId,
      type: 'group',
      x: groupX,
      y: -40,
      width: columnGap - 20,
      height,
      label: group.name,
    })
    group.nodes.forEach((item, row) => {
      nodes.push({
        id: hashId(`file:${item.file}`),
        type: 'file',
        file: item.file,
        x: groupX + 10,
        y: 20 + row * rowHeight,
        width: columnGap - 40,
        height: 110,
      })
    })
    edges.push({
      id: hashId(`edge:${group.name}`),
      fromNode: hubId,
      toNode: groupId,
      fromSide: 'right',
      toSide: 'left',
    })
  })

  return { nodes, edges }
}

/** 汇总视图：按分类分组，显示说明、来源文件和距原文更新的天数。 */
export function buildBase() {
  return `filters:
  and:
    - file.hasTag("${SYNC_TAG}")
    - 'file.ext == "md"'

formulas:
  stale_days: 'if(updated, (today() - date(updated)).days, "")'

properties:
  category:
    displayName: 分类
  description:
    displayName: 说明
  source:
    displayName: 仓库文件
  updated:
    displayName: 内容更新
  formula.stale_days:
    displayName: 距原文更新

views:
  - type: table
    name: 按分类
    order:
      - file.name
      - description
      - source
      - formula.stale_days
    groupBy:
      property: category
      direction: ASC
  - type: cards
    name: 卡片
    order:
      - file.name
      - description
      - category
`
}

export function buildSyncNote({ vaultPath, syncTime, entries }) {
  const rows = [
    '| vault 笔记 | 仓库来源 |',
    '| --- | --- |',
    ...entries.map((entry) => `| [[${entry.title}]] | \`${entry.source}\` |`),
  ]
  return [
    '## 这个知识库是怎么来的',
    '',
    'vault 里的笔记全部由仓库脚本生成，仓库文档是唯一真实来源。',
    `改完仓库里的资料后运行 \`${SYNC_COMMAND}\`，vault 会重新生成一遍。`,
    '',
    '- vault：`' + vaultPath + '`',
    `- 项目文件夹：\`${PROJECT_FOLDER}\``,
    `- 上次同步：${syncTime}`,
    '',
    '## 生成规则',
    '',
    '1. 仓库文档逐份镜像成一篇笔记，正文不改写，只补 frontmatter、标题和指向其他文档的 wikilink。',
    '2. 「变更时间线」「待办与已知问题」是从交接说明里抽出来的段落，方便单独翻阅。',
    '3. 「首页」「文档地图」「产品方向」是手写笔记，正文放在仓库的 `docs/vault/` 下，同样从仓库同步过来。',
    '4. `00 索引/全部文档.base` 和 `00 索引/资料关系.canvas` 是生成出来的视图和画布。',
    '',
    '## 复核',
    '',
    'Obsidian 开着的时候，可以用它自带的 CLI 检查生成结果：',
    '',
    '```powershell',
    `obsidian vault="${path.basename(vaultPath)}" unresolved`,
    `obsidian vault="${path.basename(vaultPath)}" base:query "path=${PROJECT_FOLDER}/00 索引/全部文档.base"`,
    '```',
    '',
    '`unresolved` 里除了仓库自带的 `欢迎.md`，不应该出现别的东西。',
    '',
    ...rows,
    '',
    '## 自己的笔记放哪',
    '',
    '脚本只会覆盖和清理带 `generated: true` 属性的笔记，也就是项目文件夹里由它生成的这些。',
    '在 vault 里另建不相关的笔记不会被碰到，在 `' + PROJECT_FOLDER + '` 里另建笔记也没问题，',
    '只要记得别把内容写进已有笔记，那些会在下次同步被覆盖。',
    '',
    '## 没有搬进来的东西',
    '',
    '- 用户数据（`workspace.json`、备份、课表内容）属于本机运行数据，不进知识库，也不进 Git。',
    '- AIHOT 资讯缓存、密钥和任何第三方内容不搬运。',
    '- 安装包、构建产物和 `vendor/` 不搬运。',
    '',
    `> [!tip] 位置提醒`,
    `> 不是所有内容都适合进 vault。跟具体代码实现强相关的细节留在仓库里，`,
    `> vault 负责的是「这是什么东西、为什么这么做、现在做到哪」。`,
    '',
  ].join('\n')
}

function readSource(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  if (!fs.existsSync(absolutePath)) {
    return { absolutePath, text: null }
  }
  return { absolutePath, text: fs.readFileSync(absolutePath, 'utf8') }
}

/**
 * Windows 允许把"文档"目录重定向到别的盘（本机就在 D:），`os.homedir()/Documents` 会指到
 * 不存在的位置。问一次系统拿真实路径，输出固定成 UTF-8，免得中文用户名被 OEM 代码页弄坏。
 */
function readDocumentsFolder() {
  if (process.platform !== 'win32') return null
  try {
    const script =
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')"
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true },
    )
    const resolved = output.trim()
    return resolved ? path.resolve(resolved) : null
  } catch {
    return null
  }
}

function documentsCandidates() {
  const candidates = []
  const fromSystem = readDocumentsFolder()
  if (fromSystem) candidates.push(fromSystem)
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, 'Documents'))
  candidates.push(path.join(os.homedir(), 'Documents'))
  return [...new Set(candidates.map((item) => path.resolve(item)))]
}

function resolveVaultPath(args) {
  const candidate = args.vault || process.env.ZP_WORKBENCH_VAULT
  if (candidate) return path.resolve(String(candidate))
  const vaults = documentsCandidates().map((directory) => path.join(directory, 'Obsidian Vault'))
  return vaults.find((directory) => fs.existsSync(directory)) || vaults[0]
}

function buildOutputs({ syncTime, vaultPath }) {
  const outputs = new Map()
  const warnings = []
  const targets = new Map()

  for (const entry of [...MIRROR_NOTES, ...SECTION_NOTES, ...LOCAL_NOTES]) {
    const basename = path.posix.basename(entry.note, '.md')
    targets.set(entry.source, basename)
  }

  const sourceCache = new Map()
  const readCached = (relativePath) => {
    if (!sourceCache.has(relativePath)) sourceCache.set(relativePath, readSource(relativePath))
    return sourceCache.get(relativePath)
  }

  const stamp = (relativePath) => {
    const { absolutePath, text } = readCached(relativePath)
    if (text === null) return formatDate(new Date())
    return formatDate(fs.statSync(absolutePath).mtime)
  }

  const compose = (entry, body, updated, label) => {
    const frontmatter = buildFrontmatter({
      title: entry.title,
      category: entry.category,
      description: entry.description,
      tags: [SYNC_TAG, `zp/${entry.category}`],
      source: entry.source,
      updated,
    })
    const callout = buildCallout({
      source: `\`${entry.source}\``,
      label,
      updated,
      syncTime,
    })
    const content = `${frontmatter}\n\n${callout}\n\n${body.trim()}\n`
    outputs.set(entry.note, content)
  }

  for (const entry of MIRROR_NOTES) {
    const { text } = readCached(entry.source)
    if (text === null) {
      warnings.push(`缺少源文件，已跳过：${entry.source}`)
      continue
    }
    const { frontmatter, body } = splitFrontmatter(text)
    const rewritten = rewriteLinks(body, entry.source, targets)
    const normalized = normalizeHeading(rewritten, entry.title)
    const extra = frontmatter
      ? `\n\n## 原始元数据\n\n源文件顶部的 YAML frontmatter 原样保留，供参考。\n\n\`\`\`\`yaml\n${frontmatter}\n\`\`\`\`\n`
      : ''
    compose(entry, `${normalized}${extra}`, stamp(entry.source))
  }

  for (const entry of SECTION_NOTES) {
    const { text } = readCached(entry.source)
    if (text === null) {
      warnings.push(`缺少源文件，已跳过：${entry.source}`)
      continue
    }
    const section = extractSection(text, entry.heading)
    if (section === null) {
      warnings.push(`源文件里找不到 ${entry.heading}，已跳过：${entry.source}`)
      continue
    }
    const rewritten = rewriteLinks(section, entry.source, targets)
    compose(entry, normalizeHeading(rewritten, entry.title), stamp(entry.source), entry.heading)
  }

  for (const entry of LOCAL_NOTES) {
    const { text } = readCached(entry.source)
    if (text === null) {
      warnings.push(`缺少手写笔记源文件，已跳过：${entry.source}`)
      continue
    }
    const { body } = splitFrontmatter(text)
    const rewritten = rewriteLinks(body, entry.source, targets)
    compose(entry, normalizeHeading(rewritten, entry.title), stamp(entry.source))
  }

  const syncEntry = {
    source: 'scripts/sync-obsidian-vault.mjs',
    note: '99 元数据/同步说明.md',
    title: '同步说明',
    category: '元数据',
    description: '知识库的生成规则、来源映射和维护方式',
  }
  const entries = [...MIRROR_NOTES, ...SECTION_NOTES, ...LOCAL_NOTES]
  const noteBody = buildSyncNote({
    vaultPath,
    syncTime,
    entries: entries.map((entry) => ({ title: entry.title, source: entry.source })),
  })
  compose(syncEntry, normalizeHeading(noteBody, syncEntry.title), formatDate(new Date()))

  return { outputs, warnings, syncEntry }
}

function existingGeneratedNotes(projectDir) {
  const found = new Set()
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, item.name)
      if (item.isDirectory()) {
        walk(absolutePath)
        continue
      }
      if (!item.name.endsWith('.md')) continue
      const text = fs.readFileSync(absolutePath, 'utf8')
      const { frontmatter } = splitFrontmatter(text)
      if (/^generated:\s*true$/m.test(frontmatter)) {
        found.add(path.relative(projectDir, absolutePath).split(path.sep).join('/'))
      }
    }
  }
  if (fs.existsSync(projectDir)) walk(projectDir)
  return found
}

function pruneEmptyDirectories(projectDir) {
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!item.isDirectory()) continue
      const child = path.join(directory, item.name)
      walk(child)
      if (fs.readdirSync(child).length === 0) fs.rmdirSync(child)
    }
  }
  walk(projectDir)
}

function buildCanvasGroups() {
  return CANVAS_GROUPS.map((group) => ({
    name: group,
    nodes: [...MIRROR_NOTES, ...SECTION_NOTES, ...LOCAL_NOTES]
      .filter((entry) => entry.category === group)
      .map((entry) => ({
        title: entry.title,
        file: `${PROJECT_FOLDER}/${entry.note}`,
      })),
  })).filter((group) => group.nodes.length > 0)
}

/** 生成 vault 里每一个文件的完整内容，写入和检查走同一份数据。 */
function buildVaultFiles({ vaultPath, syncTime }) {
  const { outputs, warnings } = buildOutputs({ syncTime, vaultPath })
  const files = new Map(outputs)
  files.set('00 索引/全部文档.base', buildBase())
  files.set(
    '00 索引/资料关系.canvas',
    `${JSON.stringify(buildCanvas(buildCanvasGroups()), null, 2)}\n`,
  )
  return { files, warnings }
}

export function syncVault({ vaultPath, syncTime, dryRun = false }) {
  const projectDir = path.join(vaultPath, PROJECT_FOLDER)
  const { files, warnings } = buildVaultFiles({ vaultPath, syncTime })

  const stale = [...existingGeneratedNotes(projectDir)].filter((note) => !files.has(note))
  const result = { projectDir, written: [], removed: [...stale], warnings, dryRun }

  if (dryRun) {
    result.written = [...files.keys()]
    return result
  }

  fs.mkdirSync(projectDir, { recursive: true })
  for (const [note, content] of files) {
    const absolutePath = path.join(projectDir, note)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
    result.written.push(note)
  }
  for (const note of stale) {
    fs.rmSync(path.join(projectDir, note), { force: true })
  }
  pruneEmptyDirectories(projectDir)
  return result
}

/**
 * 只读检查：仓库文档改完有没有同步进 vault。跳过同步时间那一行，
 * 所以"刚刚同步过"和"内容一致"都能算通过。
 */
export function checkVault({ vaultPath, syncTime }) {
  const projectDir = path.join(vaultPath, PROJECT_FOLDER)
  const { files, warnings } = buildVaultFiles({ vaultPath, syncTime })

  const outdated = []
  const missing = []
  for (const [note, content] of files) {
    const absolutePath = path.join(projectDir, note)
    if (!fs.existsSync(absolutePath)) {
      missing.push(note)
      continue
    }
    const actual = fs.readFileSync(absolutePath, 'utf8')
    if (normalizeSyncTime(actual) !== normalizeSyncTime(content)) outdated.push(note)
  }

  const stale = [...existingGeneratedNotes(projectDir)].filter((note) => !files.has(note))
  return {
    projectDir,
    checked: files.size,
    outdated,
    missing,
    stale,
    warnings,
    upToDate: outdated.length === 0 && missing.length === 0 && stale.length === 0,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const vaultPath = resolveVaultPath(args)
  const syncTime = formatDateTime(new Date())
  const checking = Boolean(args.check)

  if (!fs.existsSync(vaultPath)) {
    if (checking) {
      console.log(`没找到 vault 目录（${vaultPath}），跳过同步检查。`)
      console.log('用 --vault <路径> 或环境变量 ZP_WORKBENCH_VAULT 指定后再检查。')
      return
    }
    console.error(`找不到 vault 目录：${vaultPath}`)
    console.error('用 --vault <路径> 或环境变量 ZP_WORKBENCH_VAULT 指定。')
    process.exitCode = 1
    return
  }

  if (checking) {
    const report = checkVault({ vaultPath, syncTime })
    for (const warning of report.warnings) console.warn(`警告：${warning}`)
    const problems = report.outdated.length + report.missing.length + report.stale.length
    if (problems) {
      console.error('同步检查失败：vault 和仓库文档对不上。')
      for (const note of report.outdated) console.error(`  内容过期：${note}`)
      for (const note of report.missing) console.error(`  笔记缺失：${note}`)
      for (const note of report.stale) console.error(`  多余笔记：${note}`)
      console.error(`跑一次 \`${SYNC_COMMAND}\`（必要时加 --vault <路径>）后重试。`)
      process.exitCode = 1
      return
    }
    console.log(`同步检查通过：${report.checked} 个文件与仓库一致 → ${report.projectDir}`)
    return
  }

  const result = syncVault({ vaultPath, syncTime, dryRun: Boolean(args['dry-run']) })
  for (const warning of result.warnings) console.warn(`警告：${warning}`)

  const verb = result.dryRun ? '将要写入' : '已写入'
  console.log(`${verb} ${result.written.length} 个文件 → ${result.projectDir}`)
  for (const note of result.written) console.log(`  + ${note}`)
  for (const note of result.removed) console.log(`  - ${note}（已失效，清理）`)
  if (result.dryRun) console.log('（--dry-run，没有真正落盘）')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
}
