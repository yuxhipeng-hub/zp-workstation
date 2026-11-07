// Browser-only, in-memory examples. Never used by the Electron preload API.
export function createCreationPreview(workspace, clone, createId) {
  const now = new Date().toISOString()
  const emptyProject = (name, goal = '') => ({
    id: createId(),
    name,
    kind: 'video',
    parentId: '',
    goal,
    stage: '选题',
    brief: '',
    archived: false,
    updatedAt: now,
    createdAt: now,
    directory: '',
    sourceVersion: '',
    artifacts: [],
    reviews: [],
    tasks: [],
    runs: [],
    publications: [],
    activity: [],
  })
  const group = { ...emptyProject('日常好物', '记录日常物品的质感'), kind: 'project' }
  const example = emptyProject('晨光里的日常', '用 30 秒呈现一件日常物品的质感与使用场景')
  example.parentId = group.id
  Object.assign(example, {
    stage: '视觉打样',
    brief:
      '受众：关注生活品质的年轻人\n时长：30 秒，竖版 9:16\n风格：自然光、安静的日常场景\n交付：三镜头短片与封面',
  })
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="#d9d5cc"/><path d="M0 440L960 180V600H0Z" fill="#c5c0b5"/><ellipse cx="600" cy="480" rx="176" ry="28" fill="#b1ac9f"/><path d="M495 195H675L658 458Q585 488 512 458Z" fill="#eeeae2"/><ellipse cx="585" cy="195" rx="90" ry="20" fill="#f8f5ee"/><ellipse cx="585" cy="195" rx="73" ry="13" fill="#b7ada0"/><path d="M674 235C790 218 782 390 666 365" fill="none" stroke="#eeeae2" stroke-width="28"/><g fill="#3b3b35" font-family="sans-serif"><text x="64" y="84" font-size="15" letter-spacing="4">DAILY OBJECTS</text><text x="64" y="180" font-size="44">日常，值得慢一点。</text><text x="64" y="535" font-size="14" letter-spacing="2">视觉方向 / 预览示例</text></g></svg>`
  const image = {
    id: createId(),
    family: '封面方向',
    label: 'v1',
    type: 'image',
    createdAt: now,
    sourceVersion: '预览示例',
    acceptance: 'pending',
    digest: '',
    path: '',
    url: '',
  }
  example.artifacts.push(image)
  example.selectedArtifactId = image.id
  const second = emptyProject('周末的慢镜头', '记录冲泡与分享的片刻')
  second.parentId = group.id
  workspace.creationProjects = [group, example, second]
  const desktop = async () => {
    throw new Error('请在桌面应用中执行此操作。浏览器示例仅保存在本页内存中。')
  }
  const find = (id) => {
    const p = workspace.creationProjects.find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    return p
  }
  return {
    async creationCommand(input) {
      if (input.action === 'create') {
        if (!input.name?.trim()) throw new Error('请填写项目名称')
        const p = emptyProject(input.name.trim(), input.goal || '')
        if (input.parentId) {
          const parent = find(input.parentId)
          if (parent.parentId || parent.archived || input.kind === 'project')
            throw new Error('请选择进行中的顶层项目作为上级')
        }
        Object.assign(p, {
          kind: input.kind === 'project' ? 'project' : 'video',
          parentId: input.parentId || '',
          brief: input.brief || '',
          stage: input.stage || '选题',
        })
        workspace.creationProjects.unshift(p)
      } else {
        const p = find(input.projectId)
        if (input.action === 'edit') {
          if (!input.name?.trim()) throw new Error('请填写项目名称')
          for (const key of ['name', 'goal', 'brief', 'stage']) p[key] = input[key] || ''
          workspace.creationProjects = [
            p,
            ...workspace.creationProjects.filter((x) => x.id !== p.id),
          ]
        } else if (input.action === 'archive') p.archived = input.archived
        else if (input.action === 'select') p.selectedArtifactId = input.artifactId
        else return desktop()
        p.updatedAt = new Date().toISOString()
      }
      return clone(workspace)
    },
    async creationDetails(id) {
      const p = find(id)
      return { directoryStatus: 'disconnected', runs: clone(p.runs) }
    },
    async creationPreview(id, artifactId) {
      find(id)
      if (artifactId !== image.id)
        return { status: 'unavailable', message: '浏览器预览不读取本机文件' }
      return {
        status: 'available',
        url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cover),
      }
    },
    creationImport: desktop,
    creationConnect: desktop,
    creationRefresh: desktop,
    creationConfirmRemoval: desktop,
    creationDocument: desktop,
    creationOpen: desktop,
    creationFeedback: desktop,
    creationVideoConnect: desktop,
    creationVideoCheck: desktop,
    creationVideoPrepare: desktop,
    creationVideoSubmit: desktop,
    creationVideoStart: desktop,
    creationVideoKey: desktop,
    creationVideoTools: desktop,
    creationVideoRender: desktop,
    async creationVideoCommand(input) {
      const p = find(input.projectId)
      if (input.action === 'enable') {
        p.video = {
          content: {
            brief: { idea: p.goal },
            story: '',
            shots: [],
            designs: [],
            references: [],
            style: '',
            characters: '',
            scenes: '',
            props: '',
            colors: '',
          },
          config: {},
          edit: { width: 1080, height: 1920, fps: 30, clips: [] },
          budget: 0,
          sessions: [],
          jobs: [],
          exports: [],
          history: [],
          revision: 'preview',
        }
      } else if (input.action === 'save-content') p.video.content = clone(input.content)
      else return desktop()
      return clone(workspace)
    },
    async creationVideoState(id) {
      const p = find(id)
      return {
        video: clone(p.video),
        storyConfirmed: false,
        designConfirmed: false,
        progress: { generated: 0, shots: p.video.content.shots.length },
        ledger: { settled: 0, reserved: 0, remaining: 0 },
        directory: '浏览器内存示例',
      }
    },
  }
}
