const listeners = new Map()

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const PREVIEW_WELCOME_KEY = 'zp-workbench-preview-welcome-seen'

function readPreviewWelcomeSeen() {
  try {
    return window.localStorage.getItem(PREVIEW_WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

function writePreviewWelcomeSeen(value) {
  try {
    if (value) window.localStorage.setItem(PREVIEW_WELCOME_KEY, '1')
    else window.localStorage.removeItem(PREVIEW_WELCOME_KEY)
  } catch {
    // Preview state still works for the current page when storage is unavailable.
  }
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/)
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 12)
}

function parsePreviewWeeks(value) {
  const source = String(value ?? '').normalize('NFKC')
  if (!source.trim()) return []
  const tokens = source.match(/\d{1,2}(?:\s*-\s*\d{1,2})?/g) || []
  let weeks = []
  for (const token of tokens) {
    const range = token.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
    if (range) {
      const start = Math.min(Number(range[1]), Number(range[2]))
      const end = Math.max(Number(range[1]), Number(range[2]))
      for (let week = start; week <= end; week += 1) weeks.push(week)
    } else {
      weeks.push(Number(token))
    }
  }
  weeks = [...new Set(weeks.filter((week) => Number.isInteger(week) && week >= 1 && week <= 30))].sort(
    (left, right) => left - right,
  )
  if (/单周|周\s*[（(]?\s*单/i.test(source)) {
    weeks = weeks.filter((week) => week % 2 === 1)
  }
  if (/双周|周\s*[（(]?\s*双/i.test(source)) {
    weeks = weeks.filter((week) => week % 2 === 0)
  }
  return weeks
}

function previewWeekText(weeks) {
  if (!weeks.length) return ''
  const ranges = []
  let start = weeks[0]
  let previous = weeks[0]
  for (let index = 1; index <= weeks.length; index += 1) {
    const current = weeks[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`)
    start = current
    previous = current
  }
  return `${ranges.join(',')}周`
}

function normalizePreviewCourse(input = {}, existing = {}) {
  const merged = { ...existing, ...input }
  const weeks = Array.isArray(input.weeks)
    ? input.weeks
    : Object.hasOwn(input, 'weekText')
      ? parsePreviewWeeks(input.weekText)
      : Array.isArray(merged.weeks)
        ? merged.weeks
        : parsePreviewWeeks(merged.weekText)
  const startPeriod = Number(merged.startPeriod)
  const endPeriod = Math.max(startPeriod, Number(merged.endPeriod) || startPeriod)
  const weekday = Number(merged.weekday)
  const name = String(merged.name || '').trim()
  if (
    !name ||
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    !Number.isInteger(startPeriod) ||
    startPeriod < 1 ||
    startPeriod > 20
  ) {
    throw new Error('请填写课程名称、星期和正确的节次。')
  }
  const normalizedWeeks = [
    ...new Set(
      weeks
        .map(Number)
        .filter((week) => Number.isInteger(week) && week >= 1 && week <= 30),
    ),
  ].sort((left, right) => left - right)
  return {
    id:
      merged.id ||
      globalThis.crypto?.randomUUID?.() ||
      `preview-course-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.slice(0, 100),
    teacher: String(merged.teacher || '').trim().slice(0, 40),
    location: String(merged.location || '').trim().slice(0, 80),
    weekday,
    startPeriod,
    endPeriod: Math.min(endPeriod, 20),
    startTime: String(merged.startTime || '').trim().slice(0, 8),
    endTime: String(merged.endTime || '').trim().slice(0, 8),
    weeks: normalizedWeeks,
    weekText: String(merged.weekText || previewWeekText(normalizedWeeks))
      .trim()
      .slice(0, 80),
    raw: String(merged.raw || '').slice(0, 1000),
  }
}

function previewCourseKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·、,，]+/g, '')
    .replace(/(实验|实训|实践|课程|课)+$/g, '')
}

function previewUnclassified(value) {
  const key = previewCourseKey(value)
  return !key || ['未分类', '未分类实验', '未分类课程', 'uncategorized'].includes(key)
}

function linkPreviewCourses(state) {
  const workspace = state.workspace
  const courses = Array.isArray(workspace.courses) ? workspace.courses : (workspace.courses = [])
  const byKey = new Map()
  for (const course of courses) {
    const key = previewCourseKey(course.name)
    if (key && !byKey.has(key)) byKey.set(key, course)
  }
  const ensure = (rawName) => {
    const name = String(rawName || '').trim().slice(0, 100)
    if (previewUnclassified(name)) return null
    const key = previewCourseKey(name)
    let course = byKey.get(key)
    if (!course) {
      course = courses.find((candidate) => {
        const candidateKey = previewCourseKey(candidate.name)
        if (!candidateKey) return false
        const ratio =
          Math.min(candidateKey.length, key.length) / Math.max(candidateKey.length, key.length)
        return ratio >= 0.6 && (candidateKey.includes(key) || key.includes(candidateKey))
      })
    }
    if (!course) {
      course = {
        id: `preview-course-${courses.length + 1}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        aliases: [],
        color: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      courses.push(course)
      byKey.set(key, course)
    }
    return course
  }
  for (const item of workspace.assignments || []) {
    item.courseId = ensure(item.course)?.id || ''
  }
  for (const item of workspace.knowledge || []) {
    item.courseId = ensure(item.course || item.source?.group)?.id || ''
  }
  for (const item of workspace.experiments || []) {
    item.courseId = ensure(item.group)?.id || ''
  }
  for (const course of workspace.schedule?.courses || []) {
    course.courseId = ensure(course.name)?.id || ''
  }
  return courses
}

function previewWeekNumber(termStartDate, now = new Date()) {
  const match = String(termStartDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < start.getTime()) return null
  return Math.min(30, Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1)
}

function previewReminderSummary(state, now = new Date()) {
  const workspace = state.workspace
  const weekday = now.getDay() === 0 ? 7 : now.getDay()
  const week = previewWeekNumber(state.settings.termStartDate, now)
  const courses = (workspace.schedule?.courses || [])
    .filter(
      (course) =>
        course.weekday === weekday &&
        (!course.weeks?.length || week === null || course.weeks.includes(week)),
    )
    .sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)))
  const assignments = (workspace.assignments || [])
    .filter((item) => item.status !== 'done' && item.dueAt)
    .filter((item) => {
      const due = new Date(`${item.dueAt}T23:59:59`)
      return due.getTime() - now.getTime() <= 7 * 86400000
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  const knowledge = (workspace.knowledge || []).filter(
    (item) => item.dueAt && new Date(item.dueAt).getTime() <= now.getTime(),
  )
  return { at: now.toISOString(), courses, assignments, knowledge }
}

function inferPreviewExperimentGroup(fileName) {
  const normalized = String(fileName || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·]+/g, '')
  if (normalized.includes('算法设计与分析') || normalized.includes('算法设计')) {
    return '算法设计与分析实验'
  }
  if (normalized.includes('面向对象') || normalized.includes('oop')) {
    return '面向对象程序设计实验'
  }
  if (
    normalized.includes('计算机系统') ||
    normalized.includes('操作系统实验') ||
    normalized.includes('csapp')
  ) {
    return '计算机系统基础'
  }
  const baseName = String(fileName || '').replace(/\.[^.]+$/, '')
  const marker = baseName.search(/实验|作业|报告|lab|experiment/i)
  return (marker > 1 ? baseName.slice(0, marker) : baseName).trim() || '未分类实验'
}

function normalizePreviewGroup(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·]+/g, '')
}

function resolvePreviewExperimentGroup(fileName, existingGroups) {
  const inferred = inferPreviewExperimentGroup(fileName)
  const normalizedInferred = normalizePreviewGroup(inferred)
  if (!normalizedInferred || normalizedInferred === normalizePreviewGroup('未分类实验')) return ''
  for (const candidate of existingGroups) {
    const normalizedCandidate = normalizePreviewGroup(candidate)
    if (
      normalizedCandidate &&
      (normalizedCandidate === normalizedInferred ||
        normalizedCandidate.includes(normalizedInferred) ||
        normalizedInferred.includes(normalizedCandidate))
    ) {
      return candidate
    }
  }
  return ''
}

function emit(channel, payload) {
  for (const listener of listeners.get(channel) || []) listener(clone(payload))
}

function subscribe(channel, callback) {
  const channelListeners = listeners.get(channel) || new Set()
  channelListeners.add(callback)
  listeners.set(channel, channelListeners)
  return () => channelListeners.delete(callback)
}

function createPreviewState() {
  const now = Date.now()
  const dshHome = 'C:\\Users\\小zp\\.dsh'
  const previewParams = new URLSearchParams(window.location.search)
  const requestedTheme = previewParams.get('theme')
  const previewWelcomeSeen =
    previewParams.get('welcome') === 'seen' || readPreviewWelcomeSeen()
  const theme = ['system', 'dark', 'light'].includes(requestedTheme) ? requestedTheme : 'dark'
  return {
    settings: {
      channel: 'latest',
      npmRegistry: 'https://registry.npmmirror.com',
      dshHome,
      experimentDir: 'C:\\Users\\小zp\\ZP Workbench\\实验资料',
      host: '127.0.0.1',
      port: 3080,
      openMode: 'embedded',
      autoCheckDsh: true,
      autoCheckLauncher: true,
      minimizeToTray: true,
      launchAtLogin: false,
      theme,
      termStartDate: '2026-09-01',
      notificationsEnabled: true,
      classReminderMinutes: 15,
      assignmentReminderDays: 1,
      reviewReminderEnabled: true,
      dailyDigestTime: '08:00',
      reviewReminderTime: '19:00',
      reminderLog: {},
      onboarding: {
        welcomeSeen: previewWelcomeSeen,
        guideVersion: 1,
        completedSteps: [],
        dismissedAt: null,
        completedAt: null,
      },
      updateHistory: [],
    },
    backups: [
      {
        fileName: 'workspace-preview-auto.json',
        size: 18432,
        createdAt: new Date(now - 1000 * 60 * 90).toISOString(),
        summary: { assignments: 3, knowledge: 5, experiments: 3, courses: 4 },
      },
    ],
    status: {
      installed: true,
      installedVersion: '0.1.4-rc.2',
      selectedVersion: '0.1.4-rc.2',
      updateState: 'current',
      updateAvailable: false,
      channel: 'latest',
      channelLabel: '稳定版',
      registryError: null,
      dshHome,
      runtimeDir: 'D:\\dsh壳\\vendor',
      logsDir: 'C:\\Users\\小zp\\AppData\\Roaming\\deepseek-harness-launcher\\logs',
      nodeVersion: '24.18.0',
      npmVersion: '12.0.2',
      systemNode: true,
      launcherVersion: '0.3.0',
      channels: {
        latest: '0.1.4-rc.2',
        next: '0.1.5-rc.1',
        alpha: '0.1.6-alpha.1',
      },
      process: {
        running: false,
        pid: null,
        url: '127.0.0.1:3080',
      },
    },
    channels: {
      latest: {
        id: 'latest',
        label: '稳定版',
        description: '推荐日常使用，跟随 npm latest 标签。',
      },
      next: {
        id: 'next',
        label: '预览版',
        description: '提前体验候选版本，可能包含兼容性变化。',
      },
      alpha: {
        id: 'alpha',
        label: '开发版',
        description: '开发预览通道，适合主动测试和反馈问题。',
      },
    },
    release: {
      htmlUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases',
      docsUrl: 'https://deepseek-harness.github.io/deepseek-harness/',
    },
    launcherUpdate: {
      supported: true,
      currentVersion: '0.3.0',
      latestVersion: '0.3.1',
      updateAvailable: true,
      checking: false,
      downloading: false,
      downloaded: false,
      message: '发现新版本 0.3.1，可以下载更新。',
      notes: '优化页面动画、修复课表编辑和资料归档问题。',
      publishedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
      htmlUrl: 'https://github.com/yuxhipeng-hub/zp-workstation/releases',
      checkedAt: new Date(now - 1000 * 60 * 8).toISOString(),
      error: null,
      sourceId: 'github-api-gh-proxy',
      sourceLabel: '国内 GitHub API 加速',
      sources: [
        { id: 'manifest-direct', label: 'GitHub 更新清单', status: 'failed' },
        { id: 'manifest-gh-proxy', label: '国内加速更新清单', status: 'failed' },
        { id: 'github-direct', label: 'GitHub 直连', status: 'failed' },
        { id: 'github-api-gh-proxy', label: '国内 GitHub API 加速', status: 'selected' },
      ],
      asset: {
        name: 'ZP-Workbench-Setup-0.3.1-x64.exe',
        size: 112 * 1024 * 1024,
        sha256: '65a713d91e8ddba9b5a18decbd8f9529b9421c1d203b29b1db1669c835e97ec4',
        downloadUrls: [
          {
            id: 'github-direct',
            label: 'GitHub 直连',
            url: 'https://github.com/yuxhipeng-hub/zp-workstation/releases',
          },
          {
            id: 'github-download-gh-proxy',
            label: '国内 GitHub 下载加速',
            url: 'https://gh-proxy.com/https://github.com/yuxhipeng-hub/zp-workstation/releases',
          },
        ],
      },
    },
    logs: [
      {
        at: new Date(now - 1000 * 45).toISOString(),
        scope: 'preview',
        level: 'info',
        message: '浏览器预览已连接，所有操作均为模拟。',
      },
      {
        at: new Date(now - 1000 * 180).toISOString(),
        scope: 'update',
        level: 'success',
        message: 'DeepSeek Harness 已是最新版本。',
      },
    ],
    history: [],
    plugins: {
      profile: 'web',
      initialized: true,
      plugins: [
        {
          name: '@deepseek-ai/dsh-web-profile',
          version: '0.1.4-rc.2',
          active: true,
        },
      ],
    },
    modelConfig: {
      dshHome,
      defaultModel: {
        provider: 'DeepSeek',
        model: 'deepseek-chat',
        reasoningEffort: 'medium',
      },
      credentials: {
        exists: true,
        refs: ['DEEPSEEK_API_KEY'],
        deepseekStored: true,
        path: `${dshHome}\\.credentials.yaml`,
      },
      settings: {
        exists: true,
        path: `${dshHome}\\settings.yaml`,
      },
      profile: {
        exists: true,
        path: `${dshHome}\\profiles\\web`,
      },
    },
    skills: {
      skillsRoot: `${dshHome}\\skills`,
      agentsRoot: 'C:\\Users\\小zp\\.agents\\skills',
      bundledRoot: '',
      roots: [
        {
          kind: 'dsh',
          label: 'DSH 用户',
          path: `${dshHome}\\skills`,
          exists: true,
        },
        {
          kind: 'agents',
          label: 'Agent 共享',
          path: 'C:\\Users\\小zp\\.agents\\skills',
          exists: true,
        },
      ],
      counts: {
        total: 5,
        dsh: 3,
        agents: 2,
        bundled: 0,
        active: 4,
        userInvocable: 4,
        shadowed: 0,
      },
      skills: [
        {
          id: 'dsh:ui-ux-pro-max',
          name: 'ui-ux-pro-max',
          folder: 'ui-ux-pro-max',
          description: '面向 Web、移动端和桌面端的 UI/UX 设计与实现知识库。',
          whenToUse: '需要设计、审查或修复界面时使用。',
          active: true,
          userInvocable: true,
          kind: 'dsh',
          sourceLabel: 'DSH 用户',
          sourcePath: `${dshHome}\\skills`,
          invocation: '$ui-ux-pro-max',
          directory: `${dshHome}\\skills\\ui-ux-pro-max`,
          skillFile: `${dshHome}\\skills\\ui-ux-pro-max\\SKILL.md`,
          updatedAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
        },
        {
          id: 'dsh:find-skill',
          name: 'find-skill',
          folder: 'find-skill',
          description: '根据当前问题寻找合适的 Skill，并搜索 GitHub 上高星的相关项目。',
          active: true,
          userInvocable: true,
          kind: 'dsh',
          sourceLabel: 'DSH 用户',
          sourcePath: `${dshHome}\\skills`,
          invocation: '$find-skill',
          directory: `${dshHome}\\skills\\find-skill`,
          skillFile: `${dshHome}\\skills\\find-skill\\SKILL.md`,
          updatedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
        },
        {
          id: 'dsh:grilling',
          name: 'grilling',
          folder: 'grilling.md',
          description: '持续追问并检验方案、决策或设计，直到关键分支都被明确。',
          active: true,
          userInvocable: true,
          kind: 'dsh',
          sourceLabel: 'DSH 用户',
          sourcePath: `${dshHome}\\skills`,
          invocation: '$grilling',
          directory: `${dshHome}\\skills`,
          skillFile: `${dshHome}\\skills\\grilling.md`,
          updatedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
        },
        {
          id: 'agents:shared-research',
          name: 'shared-research',
          folder: 'shared-research',
          description: '由多个本地 Agent 共享的资料检索与整理能力。',
          active: true,
          userInvocable: false,
          kind: 'agents',
          sourceLabel: 'Agent 共享',
          sourcePath: 'C:\\Users\\小zp\\.agents\\skills',
          invocation: '$shared-research',
          directory: 'C:\\Users\\小zp\\.agents\\skills\\shared-research',
          skillFile: 'C:\\Users\\小zp\\.agents\\skills\\shared-research\\SKILL.md',
          updatedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
        },
        {
          id: 'agents:export-helper',
          name: 'export-helper',
          folder: 'export-helper',
          description: '整理导出文件，但当前禁止模型自动调用。',
          active: false,
          userInvocable: true,
          kind: 'agents',
          sourceLabel: 'Agent 共享',
          sourcePath: 'C:\\Users\\小zp\\.agents\\skills',
          invocation: '$export-helper',
          directory: 'C:\\Users\\小zp\\.agents\\skills\\export-helper',
          skillFile: 'C:\\Users\\小zp\\.agents\\skills\\export-helper\\SKILL.md',
          updatedAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
        },
      ],
    },
    workspace: {
      version: 2,
      courses: [],
      assignments: [
        {
          id: 'preview-assignment-1',
          title: '线性代数第 3 章习题',
          course: '线性代数',
          dueAt: '2026-09-22',
          priority: 'high',
          status: 'doing',
          notes: '完成矩阵秩、向量组线性相关性的证明题。',
          createdAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 55).toISOString(),
        },
        {
          id: 'preview-assignment-2',
          title: '大学物理实验报告',
          course: '大学物理',
          dueAt: '2026-09-25',
          priority: 'medium',
          status: 'inbox',
          notes: '整理示波器实验数据，补齐误差分析和思考题。',
          createdAt: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 48).toISOString(),
        },
        {
          id: 'preview-assignment-3',
          title: '英语课程展示提纲',
          course: '大学英语',
          dueAt: '2026-09-30',
          priority: 'low',
          status: 'done',
          notes: '三分钟展示，主题为本地 AI 工具的使用边界。',
          createdAt: new Date(now - 1000 * 60 * 60 * 80).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
        },
      ],
      knowledge: [
        {
          id: 'preview-knowledge-1',
          title: '快速排序的平均时间复杂度',
          course: '算法设计与分析实验',
          tags: ['排序', '复杂度', '分治'],
          content:
            '快速排序采用分治策略。平均情况下每次划分接近均衡，递归深度为 O(log n)，每层处理 O(n)，因此平均时间复杂度为 O(n log n)。',
          type: 'formula',
          source: {
            experimentId: 'preview-experiment-1',
            filePath:
              'C:\\Users\\小zp\\ZP Workbench\\实验资料\\算法设计与分析实验\\算法设计与分析实验报告.pdf',
            fileName: '算法设计与分析实验报告.pdf',
            group: '算法设计与分析实验',
            pageStart: 3,
            pageEnd: 3,
            excerpt: '平均情况下，每次划分将序列分成两个规模相近的子序列。',
          },
          mastery: 2,
          reviewStage: 2,
          dueAt: new Date(now - 1000 * 60 * 30).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 70).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
        },
        {
          id: 'preview-knowledge-2',
          title: '归并排序需要额外空间',
          course: '算法设计与分析实验',
          tags: ['排序', '空间复杂度'],
          content:
            '归并排序合并两个有序数组时需要辅助数组，因此常见实现的空间复杂度为 O(n)，这是它相对原地排序的主要代价。',
          type: 'pitfall',
          source: {
            experimentId: 'preview-experiment-1',
            filePath:
              'C:\\Users\\小zp\\ZP Workbench\\实验资料\\算法设计与分析实验\\算法设计与分析实验报告.pdf',
            fileName: '算法设计与分析实验报告.pdf',
            group: '算法设计与分析实验',
            pageStart: 5,
            pageEnd: 5,
            excerpt: '合并阶段需要长度为 n 的临时数组保存合并结果。',
          },
          mastery: 1,
          reviewStage: 1,
          dueAt: new Date(now + 1000 * 60 * 60 * 24).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 44).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
        },
        {
          id: 'preview-knowledge-3',
          title: '运行时多态的三个必要条件',
          course: '面向对象程序设计实验',
          tags: ['多态', '继承', '重写'],
          content:
            '运行时多态通常需要继承关系、子类重写父类方法，以及父类引用指向子类对象。调用时根据对象的实际类型选择方法实现。',
          type: 'definition',
          source: {
            experimentId: 'preview-experiment-2',
            filePath:
              'C:\\Users\\小zp\\ZP Workbench\\实验资料\\面向对象程序设计实验\\面向对象程序设计实验三.pdf',
            fileName: '面向对象程序设计实验三.pdf',
            group: '面向对象程序设计实验',
            pageStart: 2,
            pageEnd: 4,
            excerpt: '父类引用可以接收子类对象，并在运行时调用被重写的方法。',
          },
          mastery: 3,
          reviewStage: 4,
          dueAt: new Date(now + 1000 * 60 * 60 * 24 * 10).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
        },
        {
          id: 'preview-knowledge-4',
          title: '虚方法表如何支持动态绑定',
          course: '面向对象程序设计实验',
          tags: ['多态', '虚方法表'],
          content:
            '对象头关联虚方法表，表中记录该对象实际类型可调用的方法入口。调用重写方法时通过虚方法表定位实现，从而实现动态绑定。',
          type: 'method',
          source: {
            experimentId: 'preview-experiment-2',
            filePath:
              'C:\\Users\\小zp\\ZP Workbench\\实验资料\\面向对象程序设计实验\\面向对象程序设计实验三.pdf',
            fileName: '面向对象程序设计实验三.pdf',
            group: '面向对象程序设计实验',
            pageStart: 6,
            pageEnd: 6,
            excerpt: '动态绑定通过运行时类型信息找到实际方法入口。',
          },
          mastery: 0,
          reviewStage: 0,
          dueAt: new Date(now).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
        },
        {
          id: 'preview-knowledge-5',
          title: '程序局部性对缓存命中率的影响',
          course: '计算机系统基础',
          tags: ['缓存', '局部性'],
          content:
            '时间局部性指刚访问的数据可能再次访问；空间局部性指相邻地址可能很快访问。循环访问连续数组通常具有较好的空间局部性。',
          type: 'concept',
          source: {
            experimentId: 'preview-experiment-3',
            filePath:
              'C:\\Users\\小zp\\ZP Workbench\\实验资料\\计算机系统基础\\计算机系统基础实验一.pdf',
            fileName: '计算机系统基础实验一.pdf',
            group: '计算机系统基础',
            pageStart: 8,
            pageEnd: 9,
            excerpt: '连续访问数组元素会充分利用缓存行。',
          },
          mastery: 1,
          reviewStage: 1,
          dueAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 7).toISOString(),
        },
        {
          id: 'preview-knowledge-6',
          title: '示波器读图步骤',
          course: '大学物理',
          tags: ['实验', '示波器'],
          content: '先确认时基和电压档位，再读取峰峰值、周期和相位差；计算误差时保留有效数字。',
          type: 'method',
          source: {
            experimentId: 'preview-experiment-5',
            filePath: 'C:\\Users\\小zp\\ZP Workbench\\实验资料\\大学物理\\实验数据记录.xlsx',
            fileName: '实验数据记录.xlsx',
            group: '大学物理',
            pageStart: 1,
            pageEnd: 1,
            excerpt: '读取峰峰值前先核对时基与电压档位。',
          },
          mastery: 2,
          reviewStage: 2,
          dueAt: new Date(now + 1000 * 60 * 60 * 24 * 3).toISOString(),
          createdAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
        },
      ],
      experiments: [
        {
          id: 'preview-experiment-1',
          title: '算法设计与分析实验报告',
          originalName: '算法设计与分析实验报告.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\算法设计与分析实验\\算法设计与分析实验报告.pdf',
          group: '算法设计与分析实验',
          size: 1843200,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 52).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 50).toISOString(),
        },
        {
          id: 'preview-experiment-2',
          title: '面向对象程序设计实验三',
          originalName: '面向对象程序设计实验三.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\面向对象程序设计实验\\面向对象程序设计实验三.pdf',
          group: '面向对象程序设计实验',
          size: 2560000,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
        },
        {
          id: 'preview-experiment-3',
          title: '计算机系统基础实验一',
          originalName: '计算机系统基础实验一.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\计算机系统基础\\计算机系统基础实验一.pdf',
          group: '计算机系统基础',
          size: 983040,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
        },
        {
          id: 'preview-experiment-4',
          title: '课程复习提纲',
          originalName: '课程复习提纲.docx',
          filePath: 'C:\\Users\\小zp\\ZP Workbench\\实验资料\\课程资料\\课程复习提纲.docx',
          group: '课程资料',
          size: 358400,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 7).toISOString(),
        },
        {
          id: 'preview-experiment-5',
          title: '实验数据记录',
          originalName: '实验数据记录.xlsx',
          filePath: 'C:\\Users\\小zp\\ZP Workbench\\实验资料\\大学物理\\实验数据记录.xlsx',
          group: '大学物理',
          size: 71680,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
        },
      ],
      schedule: {
        source: {
          name: '2026秋季学期课表.xlsx',
          path: 'C:\\Users\\小zp\\Downloads\\2026秋季学期课表.xlsx',
          extension: '.xlsx',
          size: 284672,
          importedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
        },
        importedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
        maxPeriod: 12,
        maxWeek: 18,
        courses: [
          {
            id: 'preview-schedule-1',
            name: '高等数学',
            teacher: '周老师',
            location: '博学楼 A201',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '高等数学\n周老师\n博学楼 A201\n第1-2节\n1-16周',
          },
          {
            id: 'preview-schedule-2',
            name: '大学英语',
            teacher: '林老师',
            location: '文科楼 305',
            weekday: 1,
            startPeriod: 5,
            endPeriod: 6,
            startTime: '14:00',
            endTime: '15:40',
            weeks: [1, 3, 5, 7, 9, 11, 13, 15],
            weekText: '1-15周(单)',
            raw: '大学英语\n林老师\n文科楼 305\n第5-6节\n1-15周(单)',
          },
          {
            id: 'preview-schedule-3',
            name: '程序设计基础',
            teacher: '陈老师',
            location: '实验楼 5-208',
            weekday: 2,
            startPeriod: 3,
            endPeriod: 4,
            startTime: '10:00',
            endTime: '11:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '程序设计基础\n陈老师\n实验楼 5-208\n第3-4节',
          },
          {
            id: 'preview-schedule-4',
            name: '大学物理',
            teacher: '许老师',
            location: '理科楼 B103',
            weekday: 3,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '大学物理\n许老师\n理科楼 B103\n第1-2节',
          },
          {
            id: 'preview-schedule-5',
            name: '线性代数',
            teacher: '赵老师',
            location: '博学楼 A108',
            weekday: 3,
            startPeriod: 7,
            endPeriod: 8,
            startTime: '16:00',
            endTime: '17:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '线性代数\n赵老师\n博学楼 A108\n第7-8节',
          },
          {
            id: 'preview-schedule-6',
            name: '数据结构实验',
            teacher: '陈老师',
            location: '实验楼 5-310',
            weekday: 4,
            startPeriod: 3,
            endPeriod: 5,
            startTime: '10:00',
            endTime: '12:30',
            weeks: [2, 4, 6, 8, 10, 12, 14, 16],
            weekText: '2-16周(双)',
            raw: '数据结构实验\n陈老师\n实验楼 5-310\n第3-5节\n2-16周(双)',
          },
          {
            id: 'preview-schedule-7',
            name: '计算机系统基础',
            teacher: '沈老师',
            location: '博学楼 A401',
            weekday: 5,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '计算机系统基础\n沈老师\n博学楼 A401\n第1-2节',
          },
        ],
      },
    },
  }
}

export function createPreviewLauncherApi() {
  const state = createPreviewState()
  linkPreviewCourses(state)
  const createId = () =>
    globalThis.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return {
    on: subscribe,
    async bootstrap() {
      return clone(state)
    },
    async getStatus() {
      return clone(state.status)
    },
    async getSettings() {
      return clone(state.settings)
    },
    async patchSettings(patch) {
      state.settings = { ...state.settings, ...patch }
      if (patch?.onboarding && Object.hasOwn(patch.onboarding, 'welcomeSeen')) {
        writePreviewWelcomeSeen(patch.onboarding.welcomeSeen)
      }
      emit('settings:changed', state.settings)
      return clone(state.settings)
    },
    async checkUpdate() {
      state.status.updateState = 'current'
      state.status.updateAvailable = false
      state.status.selectedVersion = state.status.installedVersion
      emit('update:state', {
        installedVersion: state.status.installedVersion,
        selectedVersion: state.status.selectedVersion,
        state: state.status.updateState,
        updateAvailable: false,
        channel: state.status.channel,
        channelLabel: state.status.channelLabel,
      })
      return clone(state.status)
    },
    async install() {
      emit('task:update', { visible: true, title: '安装 Harness', detail: '浏览器预览模式' })
      setTimeout(
        () => emit('task:update', { visible: false, title: '安装完成', detail: '预览数据已更新' }),
        900,
      )
      return clone(state.status)
    },
    async launch() {
      state.status.process = {
        running: true,
        pid: 24816,
        url: `${state.settings.host}:${state.settings.port}`,
      }
      emit('process:state', state.status.process)
      return clone(state.status.process)
    },
    async stop() {
      state.status.process = {
        running: false,
        pid: null,
        url: `${state.settings.host}:${state.settings.port}`,
      }
      emit('process:state', state.status.process)
      return clone(state.status.process)
    },
    async listPlugins() {
      return clone(state.plugins)
    },
    async pluginAction(_profile, action, spec) {
      if (action === 'add' && spec) {
        state.plugins.plugins.push({ name: spec, version: 'preview', active: false })
      }
      if (action === 'remove') {
        state.plugins.plugins = state.plugins.plugins.filter((plugin) => plugin.name !== spec)
      }
      return clone(state.plugins)
    },
    async getModelConfig() {
      return clone(state.modelConfig)
    },
    async listSkills() {
      return clone(state.skills)
    },
    async openSkillDirectory() {
      return true
    },
    async openSkillsRoot() {
      return true
    },
    async getWorkspace() {
      return clone(state.workspace)
    },
    async listCourses() {
      const countsFor = (courseId) => ({
        schedule: (state.workspace.schedule?.courses || []).filter(
          (item) => item.courseId === courseId,
        ).length,
        assignments: state.workspace.assignments.filter((item) => item.courseId === courseId)
          .length,
        knowledge: state.workspace.knowledge.filter((item) => item.courseId === courseId).length,
        experiments: state.workspace.experiments.filter((item) => item.courseId === courseId)
          .length,
      })
      return (state.workspace.courses || []).map((course) => ({
        ...clone(course),
        counts: countsFor(course.id),
      }))
    },
    async createCourse(input) {
      const name = String(input?.name || '').trim()
      if (!name) throw new Error('课程名称不能为空。')
      if (
        (state.workspace.courses || []).some(
          (course) => previewCourseKey(course.name) === previewCourseKey(name),
        )
      ) {
        throw new Error('已存在同名课程。')
      }
      const course = {
        id: createId(),
        name,
        aliases: [],
        color: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.workspace.courses.push(course)
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async renameCourse(id, name) {
      const course = state.workspace.courses.find((item) => item.id === id)
      if (!course) throw new Error('没有找到这门课程。')
      const nextName = String(name || '').trim()
      if (!nextName) throw new Error('课程名称不能为空。')
      if (
        state.workspace.courses.some(
          (item) => item.id !== id && previewCourseKey(item.name) === previewCourseKey(nextName),
        )
      ) {
        throw new Error('已有同名课程，请使用同一个名称或先合并数据。')
      }
      const previousName = course.name
      course.aliases = [...new Set([...(course.aliases || []), previousName])]
      course.name = nextName
      course.updatedAt = new Date().toISOString()
      for (const item of state.workspace.assignments) {
        if (item.courseId === id) item.course = nextName
      }
      for (const item of state.workspace.knowledge) {
        if (item.courseId === id) item.course = nextName
      }
      for (const item of state.workspace.schedule?.courses || []) {
        if (item.courseId === id) item.name = nextName
      }
      const groupRenames = []
      for (const item of state.workspace.experiments) {
        if (item.courseId !== id) continue
        const from = item.group
        if (from && from !== nextName && !groupRenames.some((entry) => entry.from === from)) {
          groupRenames.push({ from, to: nextName })
          item.group = nextName
        }
      }
      return {
        workspace: clone(state.workspace),
        course: clone(course),
        previousName,
        groupRenames,
        failures: [],
      }
    },
    async listBackups() {
      return clone(state.backups)
    },
    async createBackup(label = 'manual') {
      const backup = {
        fileName: `workspace-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`,
        size: JSON.stringify(state.workspace).length,
        createdAt: new Date().toISOString(),
        summary: {
          assignments: state.workspace.assignments.length,
          knowledge: state.workspace.knowledge.length,
          experiments: state.workspace.experiments.length,
          courses: state.workspace.courses.length,
        },
      }
      state.backups.unshift(backup)
      return clone(backup)
    },
    async restoreBackup(fileName) {
      if (!state.backups.some((item) => item.fileName === fileName)) {
        throw new Error('没有找到这个备份文件。')
      }
      return clone(state.workspace)
    },
    async checkWorkspaceHealth() {
      return {
        checkedAt: new Date().toISOString(),
        total: state.workspace.experiments.length,
        missing: [],
        healthy: true,
      }
    },
    async getReminders() {
      return {
        enabled: state.settings.notificationsEnabled !== false,
        summary: previewReminderSummary(state),
      }
    },
    async testReminder() {
      emit('reminder:due', {
        key: 'test',
        title: 'ZP Workbench 提醒已开启',
        body: '之后会在课前、作业截止前和复习到期时提醒你。',
        at: new Date().toISOString(),
      })
      return true
    },
    async exportSnapshot() {
      return { filePath: 'C:\\Users\\小zp\\ZP Workbench\\snapshot.json', size: 4096 }
    },
    async importSnapshot() {
      return clone(state.workspace)
    },
    async createAssignment(input) {
      const now = new Date().toISOString()
      state.workspace.assignments.unshift({
        id: createId(),
        title: input.title,
        course: input.course || '',
        dueAt: input.dueAt || '',
        priority: input.priority || 'medium',
        status: input.status || 'inbox',
        notes: input.notes || '',
        createdAt: now,
        updatedAt: now,
      })
      return clone(state.workspace)
    },
    async updateAssignment(id, patch) {
      state.workspace.assignments = state.workspace.assignments.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      )
      return clone(state.workspace)
    },
    async deleteAssignment(id) {
      state.workspace.assignments = state.workspace.assignments.filter((item) => item.id !== id)
      return clone(state.workspace)
    },
    async createKnowledge(input) {
      const now = new Date().toISOString()
      state.workspace.knowledge.unshift({
        id: createId(),
        title: input.title,
        course: input.course || '',
        tags: normalizeTags(input.tags),
        content: input.content || '',
        type: 'concept',
        source: null,
        mastery: 0,
        reviewStage: 0,
        dueAt: now,
        lastReviewedAt: '',
        generatedBy: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      return clone(state.workspace)
    },
    async updateKnowledge(id, patch) {
      state.workspace.knowledge = state.workspace.knowledge.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              tags: patch.tags === undefined ? item.tags : normalizeTags(patch.tags),
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      return clone(state.workspace)
    },
    async deleteKnowledge(id) {
      state.workspace.knowledge = state.workspace.knowledge.filter((item) => item.id !== id)
      return clone(state.workspace)
    },
    async generateKnowledge(experimentId) {
      const experiment = state.workspace.experiments.find((item) => item.id === experimentId)
      if (!experiment) throw new Error('没有找到这份资料。')
      await new Promise((resolve) => setTimeout(resolve, 900))
      const now = new Date().toISOString()
      const templates = [
        {
          title: `${experiment.title}的核心定义`,
          type: 'definition',
          content: '根据资料内容提炼概念边界、适用条件和关键术语，形成可以直接复习的定义。',
          tags: ['定义', '核心概念'],
        },
        {
          title: `${experiment.title}的执行方法`,
          type: 'method',
          content: '把资料中的处理步骤整理成有顺序的方法，标出每一步的输入、输出和检查条件。',
          tags: ['方法', '步骤'],
        },
        {
          title: `${experiment.title}的易错点`,
          type: 'pitfall',
          content: '归纳资料中最容易混淆或遗漏的条件，并在复习时优先检查这些位置。',
          tags: ['易错点', '复习'],
        },
      ]
      const generated = templates.map((template, index) => ({
        id: createId(),
        ...template,
        course: experiment.group || '未分类',
        source: {
          experimentId: experiment.id,
          filePath: experiment.filePath,
          fileName: experiment.originalName,
          group: experiment.group || '未分类',
          pageStart: index + 1,
          pageEnd: index + 1,
          excerpt: '预览环境根据资料标题模拟生成，桌面版本会读取文件正文。',
        },
        mastery: 0,
        reviewStage: 0,
        dueAt: now,
        generatedBy: 'dsh',
        createdAt: now,
        updatedAt: now,
      }))
      state.workspace.knowledge = [
        ...generated,
        ...state.workspace.knowledge.filter(
          (item) => item.source?.experimentId !== experimentId,
        ),
      ]
      return {
        workspace: clone(state.workspace),
        generated: generated.length,
        source: {
          experimentId,
          fileName: experiment.originalName,
          group: experiment.group,
        },
        extraction: { pages: 3, truncated: false },
      }
    },
    async reviewKnowledge(id, rating) {
      const intervals = [0, 1, 3, 7, 14, 30]
      state.workspace.knowledge = state.workspace.knowledge.map((item) => {
        if (item.id !== id) return item
        const currentStage = Number(item.reviewStage) || 0
        const nextStage =
          rating === 'forgot'
            ? 1
            : rating === 'known'
              ? Math.min(5, currentStage + 2)
              : Math.min(5, currentStage + 1)
        const mastery = rating === 'forgot' ? 0 : rating === 'known' ? 3 : Math.max(1, item.mastery || 0)
        return {
          ...item,
          mastery,
          reviewStage: nextStage,
          dueAt: new Date(Date.now() + intervals[nextStage] * 86400000).toISOString(),
          lastReviewedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })
      return clone(state.workspace)
    },
    async importExperiments(entries) {
      const imported = []
      const rejected = []
      const createdGroups = []
      const existingGroups = new Set(
        state.workspace.experiments.map((item) => String(item.group || '').trim()).filter(Boolean),
      )
      for (const entry of entries || []) {
        const originalName = String(entry?.name || entry?.path?.split(/[\\/]/).pop() || '')
        if (!originalName) {
          rejected.push({ name: '未知文件', reason: '没有取得文件名。' })
          continue
        }
        const group =
          resolvePreviewExperimentGroup(originalName, existingGroups) ||
          inferPreviewExperimentGroup(originalName)
        if (!existingGroups.has(group)) {
          existingGroups.add(group)
          createdGroups.push(group)
        }
        const id = createId()
        imported.push({
          id,
          title: originalName.replace(/\.[^.]+$/, ''),
          originalName,
          filePath: `${state.settings.experimentDir}\\${group}\\${originalName}`,
          group,
          size: 1024 * 1024,
          modifiedAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
        })
      }
      state.workspace.experiments.unshift(...imported)
      return {
        workspace: clone(state.workspace),
        imported: imported.length,
        rejected,
        createdGroups,
      }
    },
    async updateExperiment(id, patch) {
      state.workspace.experiments = state.workspace.experiments.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              filePath: patch.group
                ? `${state.settings.experimentDir}\\${patch.group}\\${item.originalName}`
                : item.filePath,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      return {
        workspace: clone(state.workspace),
        experiment: clone(state.workspace.experiments.find((item) => item.id === id)),
      }
    },
    async renameExperimentGroup(currentGroup, nextGroup) {
      const next = String(nextGroup || '').trim()
      let renamed = 0
      state.workspace.experiments = state.workspace.experiments.map((item) => {
        if (item.group !== currentGroup) return item
        renamed += 1
        return {
          ...item,
          group: next,
          filePath: `${state.settings.experimentDir}\\${next}\\${item.originalName}`,
          updatedAt: new Date().toISOString(),
        }
      })
      return {
        workspace: clone(state.workspace),
        renamed,
        group: next,
      }
    },
    async deleteExperiment(id) {
      state.workspace.experiments = state.workspace.experiments.filter((item) => item.id !== id)
      return clone(state.workspace)
    },
    async copyText(value) {
      await navigator.clipboard.writeText(String(value ?? ''))
      return true
    },
    async chooseDshHome() {
      return `${state.settings.dshHome}-preview`
    },
    async chooseExperimentDir() {
      return `${state.settings.experimentDir}-preview`
    },
    async chooseExperimentFiles() {
      return [
        {
          name: '算法设计与分析实验五.pdf',
          path: 'C:\\preview\\算法设计与分析实验五.pdf',
        },
        {
          name: '实验数据汇总.xlsx',
          path: 'C:\\preview\\实验数据汇总.xlsx',
        },
        {
          name: '课堂展示.pptx',
          path: 'C:\\preview\\课堂展示.pptx',
        },
      ]
    },
    async chooseExperimentPdfs() {
      return this.chooseExperimentFiles()
    },
    async openExperimentFile() {
      return true
    },
    async revealExperimentFile() {
      return true
    },
    async openExperimentDirectory() {
      return true
    },
    async chooseScheduleFile() {
      return 'C:\\Users\\小zp\\Downloads\\2026秋季学期课表.xlsx'
    },
    async importSchedule(filePath) {
      const name = String(filePath || '').split(/[\\/]/).pop() || '课表.xlsx'
      state.workspace.schedule.source = {
        ...state.workspace.schedule.source,
        name,
        path: filePath,
        importedAt: new Date().toISOString(),
      }
      state.workspace.schedule.importedAt = new Date().toISOString()
      return {
        workspace: clone(state.workspace),
        schedule: clone(state.workspace.schedule),
        summary: {
          sourceName: name,
          courses: state.workspace.schedule.courses.length,
          maxWeek: state.workspace.schedule.maxWeek,
        },
      }
    },
    async stageDroppedFile() {
      throw new Error('预览环境不支持自动暂存拖入文件。')
    },
    async createScheduleCourse(input) {
      const now = new Date().toISOString()
      if (!state.workspace.schedule) {
        state.workspace.schedule = {
          source: {
            name: '手动维护',
            path: '',
            extension: '',
            size: 0,
            importedAt: now,
          },
          importedAt: now,
          maxPeriod: 10,
          maxWeek: 16,
          courses: [],
        }
      }
      const course = normalizePreviewCourse(input)
      state.workspace.schedule.courses.push(course)
      state.workspace.schedule.maxPeriod = Math.min(
        20,
        Math.max(10, ...state.workspace.schedule.courses.map((item) => item.endPeriod)),
      )
      state.workspace.schedule.maxWeek = Math.min(
        30,
        Math.max(16, ...state.workspace.schedule.courses.flatMap((item) => item.weeks)),
      )
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async updateScheduleCourse(id, patch) {
      const schedule = state.workspace.schedule
      const index = schedule?.courses.findIndex((course) => course.id === id) ?? -1
      if (index === -1) throw new Error('没有找到这门课程。')
      const course = normalizePreviewCourse(patch, schedule.courses[index])
      schedule.courses[index] = course
      schedule.maxPeriod = Math.min(
        20,
        Math.max(10, ...schedule.courses.map((item) => item.endPeriod)),
      )
      schedule.maxWeek = Math.min(
        30,
        Math.max(16, ...schedule.courses.flatMap((item) => item.weeks)),
      )
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async deleteScheduleCourse(id) {
      const schedule = state.workspace.schedule
      if (!schedule?.courses.some((course) => course.id === id)) {
        throw new Error('没有找到这门课程。')
      }
      schedule.courses = schedule.courses.filter((course) => course.id !== id)
      if (!schedule.courses.length) {
        state.workspace.schedule = null
      } else {
        schedule.maxPeriod = Math.min(
          20,
          Math.max(10, ...schedule.courses.map((item) => item.endPeriod)),
        )
        schedule.maxWeek = Math.min(
          30,
          Math.max(16, ...schedule.courses.flatMap((item) => item.weeks)),
        )
      }
      return clone(state.workspace)
    },
    async clearSchedule() {
      state.workspace.schedule = null
      return clone(state.workspace)
    },
    async revealScheduleSource() {
      return true
    },
    async openPath() {
      return true
    },
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
    async clearLogs() {
      state.logs = []
      return true
    },
    async checkLauncherUpdate() {
      return clone(state.launcherUpdate)
    },
    async downloadLauncherUpdate() {
      const total = state.launcherUpdate.asset?.size || 0
      for (const percent of [0, 18, 47, 76, 100]) {
        emit('launcher:download-progress', {
          phase: percent === 100 ? 'completed' : 'downloading',
          version: state.launcherUpdate.latestVersion,
          fileName: state.launcherUpdate.asset?.name,
          received: Math.round((total * percent) / 100),
          total,
          percent,
          at: new Date().toISOString(),
        })
        await new Promise((resolve) => setTimeout(resolve, 260))
      }
      emit('launcher:download-progress', {
        phase: 'opening',
        version: state.launcherUpdate.latestVersion,
        fileName: state.launcherUpdate.asset?.name,
        received: total,
        total,
        percent: 100,
        at: new Date().toISOString(),
      })
      return { filePath: 'C:\\Users\\小zp\\AppData\\Local\\Temp\\ZP-Workbench-Setup-0.3.1-x64.exe' }
    },
  }
}
