const listeners = new Map()

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/)
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 12)
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
  const requestedTheme = new URLSearchParams(window.location.search).get('theme')
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
      updateHistory: [],
    },
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
      launcherVersion: '0.1.4',
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
      supported: false,
      currentVersion: '0.1.4',
      latestVersion: null,
      message: '尚未配置启动器更新源。',
      asset: null,
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
    workspace: {
      version: 1,
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
          title: '矩阵秩的判定',
          course: '线性代数',
          tags: ['矩阵', '期末复习'],
          content: '把矩阵化为行阶梯形，非零行的数量就是矩阵的秩。初等行变换不改变秩。',
          createdAt: new Date(now - 1000 * 60 * 60 * 70).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
        },
        {
          id: 'preview-knowledge-2',
          title: '示波器读图步骤',
          course: '大学物理',
          tags: ['实验', '示波器'],
          content: '先确认时基和电压档位，再读取峰峰值、周期和相位差；计算误差时保留有效数字。',
          createdAt: new Date(now - 1000 * 60 * 60 * 44).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
        },
        {
          id: 'preview-knowledge-3',
          title: '展示提纲结构',
          course: '大学英语',
          tags: ['表达', '展示'],
          content: '开场提出问题，中段给出两个例子，结尾收束到一条可执行结论。',
          createdAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
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
      ],
    },
  }
}

export function createPreviewLauncherApi() {
  const state = createPreviewState()
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
    async getWorkspace() {
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
    async importExperiments(entries) {
      const imported = []
      const rejected = []
      const createdGroups = []
      const existingGroups = new Set(
        state.workspace.experiments.map((item) => String(item.group || '').trim()).filter(Boolean),
      )
      for (const entry of entries || []) {
        const originalName = String(entry?.name || entry?.path?.split(/[\\/]/).pop() || '')
        if (!originalName.toLocaleLowerCase('en-US').endsWith('.pdf')) {
          rejected.push({ name: originalName || '未知文件', reason: '目前只接收 PDF 文件。' })
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
    async chooseExperimentPdfs() {
      return [
        {
          name: '算法设计与分析实验五.pdf',
          path: 'C:\\preview\\算法设计与分析实验五.pdf',
        },
        {
          name: '操作系统实验报告.pdf',
          path: 'C:\\preview\\操作系统实验报告.pdf',
        },
      ]
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
      return true
    },
  }
}
