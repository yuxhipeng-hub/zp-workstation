import { createCreationVideo } from './creation-video.js'
import { renderCreationStepTree } from '../components/creation-step-tree.js'
import { hydrateCreationProjectMenu } from '../components/creation-project-menu.js'
import {
  creationStagePicker,
  hydrateCreationStagePicker,
} from '../components/creation-stage-picker.js'
const stages = ['选题', '简报', '视觉打样', '开发', '成片', '验收', '发布', '复盘']
const statuses = {
  pending: '待处理',
  running: '运行中',
  review: '待审查',
  blocked: '遇到阻塞',
  completed: '完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  unknown: '状态待确认',
  open: '未处理',
  doing: '处理中',
  recheck: '待复查',
  resolved: '已解决',
}

export function createCreationStudioPage({ state, api, escapeHtml: e, render, toast }) {
  const drafts = new Map()
  const thumbnails = new Map()
  let events,
    focusedStep = false,
    motion = false,
    reading = true,
    outlineStage = '',
    editSection = '',
    readerOrigin = ''
  const expandedFunctions = new Set()
  const productionStates = new Map()
  const videoPage = createCreationVideo({
    state,
    api,
    escapeHtml: e,
    render,
    toast,
    preview,
    onState(p, data) {
      productionStates.set(p.id, data)
      updateRoleText(document, { ...p, video: data.video })
    },
    onShotDeleted(id) {
      if (shotEditorId === id) shotEditorId = ''
    },
  })
  const expanded = new Set()
  const expandedVideos = new Set()
  const shotBranches = new Set()
  let shotEditorId = '',
    roleTimer
  let workspaceOpen = false,
    editParent = '',
    editTarget = '',
    zoom = 1,
    panX = 0,
    panY = 0
  let statusTimer
  let selected = '',
    tab = 'overview',
    archived = false,
    editing = '',
    artifactId = '',
    compareId = '',
    time = 0
  let filterStatus = '',
    filterPriority = '',
    sort = 'time',
    busy = false,
    error = '',
    generation = 0
  const draftKey = (form) =>
    form === 'project'
      ? 'project:' +
        (editing === 'edit' ? editTarget : editing === 'new-video' ? 'new:' + editParent : 'new')
      : selected + ':' + form
  const projects = () => state.workspace?.creationProjects || []
  const project = () => projects().find((x) => x.id === selected)
  const focusedStage = (p) => outlineStage || (tab === 'works' ? 'works' : videoPage.getStep(p))
  const current = (p) =>
    p.artifacts.find((a) => a.id === artifactId) ||
    p.artifacts.find((a) => a.id === p.selectedArtifactId) ||
    p.artifacts.at(-1)
  const stamp = (value) =>
    value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未提供'
  const button = (action, label, data = '', primary = false) =>
    `<button type="button" class="button ${primary ? 'primary' : 'secondary'}" data-action="cs-${action}" ${data} ${action === 'edit' ? 'title="编辑名称、创作要求、目标与阶段"' : action === 'open-work' ? 'title="打开完整工作区：视频制作、作品与版本、修改意见、发布复盘"' : ''} ${busy ? 'disabled' : ''}>${label}</button>`
  const options = (items, value) =>
    items
      .map(([v, l]) => `<option value="${e(v)}" ${v === value ? 'selected' : ''}>${e(l)}</option>`)
      .join('')
  const field = (name, label, value = /** @type {string | number} */ (''), type = 'text') =>
    `<label>${label}<input data-cs-field="${name}" type="${type}" value="${e(value ?? '')}" ${type === 'number' ? 'min="0" step="any"' : ''}></label>`
  const area = (name, label, value = '', rows = 3) =>
    `<label>${label}<textarea aria-label="${e(label)}" data-cs-field="${name}" rows="${rows}">${e(value)}</textarea></label>`
  const select = (name, label, items, value = '') =>
    `<label>${label}<select data-cs-field="${name}" aria-label="${e(label)}">${options(items, value)}</select></label>`
  const versions = (p) => p.artifacts.map((a) => [a.id, `${a.family} · ${a.label}`])
  function editor() {
    const saved = projects().find((x) => x.id === editTarget) || {
      name: '',
      goal: '',
      brief: '',
      stage: '选题',
    }
    const x = { ...saved, ...drafts.get(draftKey('project')) }
    const video =
      editing === 'new-video' || (editing === 'edit' && (x.parentId || x.kind !== 'project'))
    const title = editing === 'edit' ? '调整需求' : video ? '新建视频' : '新建项目'
    return `<section class="cs-editor cc-composer" data-cs-key="${e(draftKey('project'))}" aria-label="${title}"><header><span>${title}</span>${button('cancel-edit', '<i data-lucide="x" aria-hidden="true"></i>', 'aria-label="收起" title="收起"')}</header><div class="cs-project-form" data-cs-form="project"><label class="cc-title-field"><input aria-label="${video ? '视频名称' : '项目名称'}" data-cs-field="name" maxlength="120" value="${e(x.name)}" placeholder="${video ? '视频名称' : '项目名称'}"></label>${area('brief', '创作要求', x.brief, 1)}<details class="cc-extra"><summary>目标与阶段</summary><div class="cc-extra-fields">${field('goal', '一句话目标', x.goal)}${creationStagePicker(x.stage, stages, e)}</div></details><div class="cs-actions">${button('save-project', '<i data-lucide="check" aria-hidden="true"></i>保存并收起', '', true)}</div></div></section>`
  }
  function preview(p, a, slot = 'main') {
    if (!a)
      return `<div class="cs-empty"><i data-lucide="film"></i><h3>尚未导入产物</h3>${button('import', '导入第一份产物', '', true)}</div>`
    return `<figure class="cs-preview" data-cs-preview="${slot}" data-artifact="${e(a.id)}"><figcaption><strong>${e(a.family)} · ${e(a.label)}</strong><span>${a.id === p.selectedArtifactId ? '选定版本 · ' : ''}<span data-cs-acceptance>正在核对文件</span></span></figcaption><div class="cs-media" data-cs-media="${e(p.id + ':' + a.id)}"><p>正在核对本机文件…</p></div><div class="cs-meta">来源：${e(a.sourceVersion || '未提供')} · ${stamp(a.createdAt)}</div></figure>`
  }
  function overview(p, a) {
    const pending = p.reviews.filter((r) => r.status !== 'resolved')
    const blocked = p.tasks.filter((t) => t.status === 'blocked')
    return `<div class="cs-work cs-overview"><div class="cs-main-column"><div class="cs-section-heading"><h3>作品预览</h3>${p.artifacts.length ? button('latest', '查看最新产物') : ''}</div>${preview(p, a)}<section class="cs-summary" aria-label="项目概况"><div class="cs-next"><span>下一步</span><strong>${!a ? '导入第一份作品，开始审片' : pending.length ? '处理修改意见，关联修复版本后复查' : a.acceptance !== 'approved' ? '审查作品并确认验收' : '记录发布与复盘'}</strong></div><div><span>待处理意见</span><strong>${pending.length}<small>条</small></strong></div><div><span>待审查任务</span><strong>${p.tasks.filter((t) => t.status === 'review').length}<small>项</small></strong></div></section>${blocked.length ? `<p class="cs-error">阻塞问题：${e(blocked.map((t) => t.blockedReason || t.goal).join('；'))}</p>` : ''}</div><aside class="cs-context"><section class="cs-context-section"><div class="cs-section-heading"><h3>制作简报</h3>${button('edit', '编辑简报')}</div><p class="cs-prose">${e(p.brief || '尚未填写制作简报')}</p></section><section class="cs-context-section"><div class="cs-section-heading"><h3>项目目录</h3></div><p class="cs-directory" data-cs-directory>${p.directory ? e(p.directory) : '尚未关联制作目录'}</p><div class="cs-actions">${button('connect', p.directory ? '重新关联目录' : '关联目录')}${button('refresh', '刷新项目记录')}</div><details><summary>关联资料（仅供阅读）</summary><div class="cs-actions">${['BRIEF.md', 'HANDOFF.md', 'QA.md', 'README.md'].map((name) => button('document', name, `data-id="${name}"`)).join('')}</div><pre data-cs-document>选择一份资料查看。</pre></details></section><details class="cs-context-section"><summary>任务与执行详情 <span>${p.tasks.length}</span></summary>${executions(p)}</details><details class="cs-context-section"><summary>最近活动</summary>${
      p.activity
        .slice(0, 15)
        .map((a) => `<p>${e(a.message)}<small>${stamp(a.at)}</small></p>`)
        .join('') || '<p>暂无活动</p>'
    }</details></aside></div>`
  }
  function executions(p) {
    return `<h4>任务</h4>${p.tasks.map((t) => `<p>${e(t.goal)} · ${statuses[t.status]}${t.blockedReason ? `<small>${e(t.blockedReason)}</small>` : ''}</p>`).join('') || '<p>暂无任务记录</p>'}<h4>真实执行</h4>${p.runs.map((r) => `<div class="cs-run" data-cs-run="${e(r.id)}"><strong data-cs-run-state>状态待确认</strong><p>${e(r.description || r.source)}</p>${r.totalFrames > 0 ? `<progress max="${r.totalFrames}" value="${r.frames ?? 0}" aria-label="真实帧数进度"></progress><p>${r.frames ?? 0} / ${r.totalFrames} 帧</p>` : '<p>未提供可靠百分比</p>'}<small>开始 ${stamp(r.startedAt)}<br>结束 ${stamp(r.endedAt)}<br>最近状态 ${stamp(r.updatedAt)}<br>记录时长 ${r.startedAt && (r.endedAt || r.updatedAt) ? Math.max(0, Math.round((Date.parse(r.endedAt || r.updatedAt) - Date.parse(r.startedAt)) / 1000)) + ' 秒' : '未提供'}</small><p>内存 ${r.memoryMB ?? '未提供'} MB · 显存 ${r.vramMB ?? '未提供'} MB</p><small>采样 ${stamp(r.sampledAt)} · 范围 ${e(r.scope || '未提供')}</small>${r.error ? `<details><summary>错误：${e(r.error.slice(0, 100))}</summary><pre>${e(r.error)}</pre></details>` : ''}</div>`).join('') || '<p>暂无执行记录</p>'}`
  }
  function works(p, a) {
    const other = p.artifacts.find((x) => x.id === compareId)
    return `<div class="cs-panel cs-actions">${field('versionLabel', '导入版本标签（可留空）')}${field('family', '作品分组', a?.family || '作品')}${button('import', '导入产物', '', true)}</div><div class="cs-version-bar">${select('artifact', '查看版本', versions(p), a?.id)}${select('compare', '对比版本', [['', '不比较'], ...versions(p).filter(([id]) => id !== a?.id)], compareId)}${a ? button('select', '设为选定版本') + button('approve', '确认当前版本验收') : ''}</div><div class="cs-comparison ${other ? 'is-comparing' : ''}">${preview(p, a)}${other ? preview(p, other, 'compare') : ''}</div>${other ? `<div class="cs-actions">${field('seek', '同步时间点（秒）', time, 'number')}${button('sync-time', '两版定位到相同时间')}</div>` : ''}<details class="cs-panel"><summary>版本记录与原文件</summary>${p.artifacts.map((x) => `<p>${e(x.family)} · ${e(x.label)} · ${stamp(x.createdAt)}<small>${e(x.path || x.url)}<br>SHA-256：${e(x.digest || '未提供')}</small>${button('open', x.type === 'interactive' ? '在外部浏览器打开本机作品' : '外部打开文件', `data-id="${e(x.id)}"`)}</p>`).join('')}</details>`
  }
  function reviews(p, a) {
    let rows = p.reviews.filter(
      (r) =>
        (!filterStatus || r.status === filterStatus) &&
        (!filterPriority || r.priority === filterPriority),
    )
    rows = [...rows].sort((a, b) =>
      sort === 'priority'
        ? (a.priority === 'required' ? 0 : 1) - (b.priority === 'required' ? 0 : 1)
        : (a.time ?? Infinity) - (b.time ?? Infinity),
    )
    return `<div class="cs-work"><div>${preview(p, a)}${
      a
        ? `<div class="cs-panel" data-cs-form="review"><h3>添加修改意见</h3>${select('artifactId', '问题所在版本', versions(p), a.id)}<div class="cs-actions">${field('time', '时间点（秒，可留空）', '', 'number')}${button('capture-time', '取当前播放时间')}</div>${area('problem', '观察到的问题')}${area('expected', '希望达到的效果')}${select(
            'priority',
            '优先级',
            [
              ['required', '必须修改'],
              ['suggestion', '建议优化'],
            ],
          )}${button('add-review', '保存原始意见', '', true)}</div>`
        : ''
    }</div><aside class="cs-panel"><h3>修改意见 <span>${p.reviews.length}</span></h3><div class="cs-filters">${select('filterStatus', '状态', [['', '全部'], ...['open', 'doing', 'recheck', 'resolved'].map((s) => [s, statuses[s]])], filterStatus)}${select(
      'filterPriority',
      '优先级',
      [
        ['', '全部'],
        ['required', '必须修改'],
        ['suggestion', '建议优化'],
      ],
      filterPriority,
    )}${select(
      'sort',
      '排序',
      [
        ['time', '时间点'],
        ['priority', '优先级'],
      ],
      sort,
    )}</div><div class="cs-actions">${button('copy-feedback', '复制修改要求')}${button('export-feedback', '导出 Markdown')}</div>${
      rows
        .map((r) => {
          const original = p.artifacts.find((a) => a.id === r.artifactId)
          return `<article class="cs-review" data-cs-review="${e(r.id)}" data-cs-form="${e(r.id)}"><strong>${r.time === null ? '全局意见' : r.time + ' 秒'} · ${r.priority === 'required' ? '必须修改' : '建议优化'}</strong><small>${e(original?.family || '')} · ${e(original?.label || '版本不存在')} · ${stamp(r.createdAt)}</small><p>${e(r.problem)}</p><p class="cs-hint">期望：${e(r.expected)}</p>${r.time !== null ? button('locate', '定位原版本时间', `data-id="${e(r.id)}"`) : ''}${select(
            'status',
            '处理状态',
            ['open', 'doing', 'recheck', 'resolved'].map((s) => [s, statuses[s]]),
            r.status,
          )}${select('resolvedArtifactId', '修复版本', [['', '尚未关联'], ...versions(p)], r.resolvedArtifactId)}${button('update-review', '保存处理记录', `data-id="${e(r.id)}"`)}<details><summary>处理历史</summary>${r.history.map((h) => `<p>${stamp(h.at)} · ${statuses[h.status] || h.status} · ${e(p.artifacts.find((a) => a.id === h.artifactId)?.label || '未关联版本')}</p>`).join('') || '<p>暂无处理记录</p>'}</details></article>`
        })
        .join('') || '<p class="cs-empty-small">暂无符合条件的意见</p>'
    }</aside></div>`
  }
  function publications(p) {
    return `<div class="cs-work"><section class="cs-panel" data-cs-form="publication"><h3>记录发布与复盘</h3>${field('platform', '发布平台')}${field('url', '作品链接')}${field('publishedAt', '实际发布时间', '', 'datetime-local')}${select('artifactId', '对应成片版本', [['', '选择版本'], ...versions(p)])}${field('hours', '制作耗时（小时）', '', 'number')}${field('cost', '额外支出（元）', '', 'number')}${area('notes', '经验与复盘')}${button('publication', '保存发布记录', '', true)}</section><section class="cs-panel"><h3>发布记录与观察快照</h3>${p.publications.map((pub) => `<article class="cs-review"><h4>${e(pub.platform)}</h4><p>${stamp(pub.publishedAt)} · ${e(p.artifacts.find((a) => a.id === pub.artifactId)?.label || '')}</p><p>${e(pub.url)}</p><p>耗时 ${pub.hours ?? '未知'} 小时 · 支出 ${pub.cost ?? '未知'} 元</p><p class="cs-prose">${e(pub.notes)}</p><details><summary>添加一次观察快照</summary><div data-cs-form="${e(pub.id)}">${field('observedAt', '数据观察时间', '', 'datetime-local')}${['views', 'likes', 'comments', 'shares', 'favorites', 'followers'].map((k, i) => field(k, ['播放', '点赞', '评论', '分享', '收藏', '新增关注'][i], '', 'number')).join('')}${button('observation', '保存独立快照', `data-id="${e(pub.id)}"`)}</div></details>${pub.observations.map((o) => `<p>${stamp(o.observedAt)}<small>播放 ${o.views ?? '未知'} · 赞 ${o.likes ?? '未知'} · 评论 ${o.comments ?? '未知'} · 分享 ${o.shares ?? '未知'} · 收藏 ${o.favorites ?? '未知'} · 新增关注 ${o.followers ?? '未知'}</small></p>`).join('') || '<p>暂无观察快照</p>'}</article>`).join('') || '<p>暂无发布记录</p>'}</section></div>`
  }
  const children = (root) => [
    ...(root.kind !== 'project' ? [root] : []),
    ...projects().filter((x) => x.parentId === root.id),
  ]
  function roots(scope = archived) {
    return projects().filter(
      (x) =>
        !x.parentId && (x.archived === scope || (scope && children(x).some((v) => v.archived))),
    )
  }
  function roleItems(p) {
    const v = p.video,
      c = v?.content
    const director = v?.sessions.filter((x) => x.role === 'director').at(-1)
    const reviewer = v?.sessions.filter((x) => x.role === 'reviewer').at(-1)
    const runLabel = (record) =>
      record
        ? statuses[record.status] ||
          {
            succeeded: '已完成',
            pass: '审核通过',
            fail: '需修改',
            queued: '排队中',
            submitting: '提交中',
            processing: '后期处理中',
            downloading: '下载中',
          }[record.status] ||
          '状态待核对'
        : '待开始'
    return [
      [
        'story',
        '故事策划',
        'Codex 导演',
        director?.status === 'running'
          ? '导演会话处理中'
          : c?.story
            ? '已有故事草稿'
            : director?.status === 'completed'
              ? '有导演回复'
              : director
                ? runLabel(director)
                : '待开始',
      ],
      [
        'shots',
        '分镜与提示词',
        'Codex 导演',
        c?.shots.length ? `${c.shots.length} 个分镜` : '待开始',
      ],
      [
        'design',
        '设定与首尾帧',
        '图片工具 / 你',
        c?.designs.length ? `${c.designs.length} 项设定` : '待准备',
      ],
      [
        'audit',
        '独立审核',
        'Codex 审核',
        reviewer?.status === 'completed' ? '有审核记录' : runLabel(reviewer),
      ],
      ['generate', '视频生成', '视频模型', runLabel(v?.jobs.at(-1))],
      ['edit', '后期制作', 'FFmpeg', runLabel(v?.exports.at(-1))],
      [
        'works',
        '最终验收',
        '你',
        p.artifacts.some((a) => a.acceptance === 'approved') ? '有验收记录' : '待验收',
      ],
    ]
  }
  function updateRoleText(root, p) {
    const node = root.querySelector(`[data-cc-video="${CSS.escape(p.id)}"] .cc-roles`)
    if (!node) return
    const items = roleItems(p)
    node.querySelectorAll('.cc-stage-status').forEach((label, i) => {
      if (label.textContent !== items[i][3]) label.textContent = items[i][3]
    })
  }
  function roles(p) {
    return roleItems(p)
      .map(([step, label, owner, status], i) => {
        const active = workspaceOpen && focusedStep && selected === p.id && focusedStage(p) === step
        const show = active && !shotEditorId
        const shots = p.video?.content.shots || []
        const opened = shotBranches.has(p.id)
        return `<div class="cc-stage-node" data-cc-stage="${e(p.id + ':' + step)}" data-cs-key="stage:${e(p.id)}:${step}"><div class="cc-stage-row"><span class="cc-stage-index">${String(i + 1).padStart(2, '0')}</span><div class="cc-stage-title"><button type="button" class="cc-stage" data-action="cs-stage" data-video="${e(p.id)}" data-id="${step}" aria-expanded="${show}" aria-controls="cs-step-${e(p.id)}-${step}"><strong>${label}</strong></button>${step === 'shots' && !reading ? button('shots-toggle', '<i data-lucide="' + (opened ? 'chevron-down' : 'chevron-right') + '" aria-hidden="true"></i>', `data-id="${e(p.id)}" aria-expanded="${opened}" aria-label="展开${e(p.name)}的镜头"`) : ''}<button type="button" class="cc-function-edit" data-action="cs-edit-step" data-video="${e(p.id)}" data-id="${step}" data-stage="${step}" data-tab="${step === 'works' ? 'works' : 'video'}" aria-label="编辑${label}" title="编辑${label}"><i data-lucide="pencil-line" aria-hidden="true"></i></button></div><span class="cc-stage-owner">${owner}</span><span class="cc-stage-status">${e(status)}</span></div>${show ? workpage(p) : ''}${
          step === 'shots' && opened && !reading
            ? `<div class="cc-shot-list" data-cs-key="shots:${e(p.id)}" aria-label="${e(p.name)}的镜头">${
                shots
                  .map((shot, index) => {
                    const editingShot = active && shotEditorId === shot.id
                    return `<div class="cc-shot-node" data-cc-shot="${e(shot.id)}" data-cs-key="shot:${e(p.id)}:${e(shot.id)}"><div class="cc-shot-row"><button type="button" class="cc-shot-trigger" data-action="cs-shot-open" data-video="${e(p.id)}" data-id="${e(shot.id)}" aria-expanded="${editingShot}">镜头 ${String(index + 1).padStart(2, '0')} · ${e(shot.purpose || (shot.story || '').slice(0, 24) || '未命名镜头')}</button><span>${shot.duration} 秒</span></div>${editingShot ? workpage(p, shot) : ''}</div>`
                  })
                  .join('') ||
                `<div class="cc-shot-empty"><span>暂无镜头</span>${button('stage', '编辑分镜', `data-video="${e(p.id)}" data-id="shots"`)}</div>`
              }</div>`
            : ''
        }</div>`
      })
      .join('')
  }
  function workpage(p, shot = null) {
    const a = current(p)
    if (focusedStep && reading) {
      const step = focusedStage(p)
      return `<section class="cc-workpage cc-step-tree" data-cs-step="${e(step)}" id="cs-step-${e(p.id)}-${e(step)}" data-cs-key="read:${e(p.id)}:${e(step)}" aria-label="制作内容树">${renderCreationStepTree(p, step, { escapeHtml: e, preview, data: productionStates.get(p.id) }, expandedFunctions)}</section>`
    }
    return `<section class="cc-workpage" data-cs-step="${focusedStep ? focusedStage(p) : 'all'}" id="cs-step-${e(p.id)}-${focusedStep ? focusedStage(p) : tab === 'works' ? 'works' : videoPage.getStep(p)}" data-cs-key="work:${e(p.id)}:${focusedStep ? videoPage.getStep(p) + ':' + tab : 'all'}:${e(shot?.id || '')}" aria-label="视频工作区"><header class="cs-project-heading"><div><span class="cc-eyebrow">${e(p.stage)} · ${p.archived ? '已归档' : '视频工作页'}</span><h2>${e(shot ? '镜头 ' + String(p.video.content.shots.findIndex((s) => s.id === shot.id) + 1).padStart(2, '0') + ' · ' + (shot.purpose || '未命名镜头') : p.name)}</h2></div><div class="cs-actions">${!focusedStep || ['design', 'edit', 'works'].includes(tab === 'works' ? 'works' : videoPage.getStep(p)) ? button('import', '导入素材') : ''}${!focusedStep ? button('edit', '调整需求', `data-id="${e(p.id)}"`) : ''}${focusedStep ? button('read-step', '<i data-lucide="arrow-left" aria-hidden="true"></i>', 'aria-label="返回内容" title="返回内容"') : ''}${button('close-work', '<i data-lucide="chevron-up" aria-hidden="true"></i>收起工作页')}</div></header>${
      focusedStep
        ? ''
        : `<nav class="cs-tabs" aria-label="项目详情">${[
            ['video', '视频制作'],
            ['overview', '总览'],
            ['works', '作品与版本'],
            ['reviews', '修改意见'],
            ['publications', '发布复盘'],
          ]
            .map(
              ([key, label]) =>
                `<button type="button" data-action="cs-tab" data-id="${key}" aria-current="${tab === key ? 'page' : 'false'}">${label}${key === 'reviews' && p.reviews.some((r) => r.status !== 'resolved') ? `<span>${p.reviews.filter((r) => r.status !== 'resolved').length}</span>` : ''}</button>`,
            )
            .join(
              '',
            )}<details class="cs-more"><summary aria-label="更多项目操作">更多<i data-lucide="chevron-down" aria-hidden="true"></i></summary><div class="cs-more-menu">${button('import', '导入产物')}${button('archive', p.archived ? '重新打开项目' : '归档项目')}${button('delete', '移除工作室记录')}</div></details></nav>`
    }${{ overview: () => overview(p, a), video: () => videoPage.renderPage(p, { focused: focusedStep, shotOnly: !!shot, section: editSection }), works: () => works(p, a), reviews: () => reviews(p, a), publications: () => publications(p) }[tab]()}</section>`
  }
  function videoObject(p) {
    const open = expandedVideos.has(p.id)
    return `<article class="cc-video" data-cc-video="${e(p.id)}"><div class="cc-video-object"><button type="button" class="cc-video-trigger" data-action="cs-project" data-id="${e(p.id)}" aria-expanded="${open}"><i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i><span class="cs-thumbnail cc-cover" data-cs-thumbnail="${e(p.id)}">${thumbnails.has(p.id) ? `<img alt="" src="${e(thumbnails.get(p.id).url)}">` : '<i data-lucide="film" aria-hidden="true"></i>'}</span><strong>${e(p.name)}</strong></button><div class="cc-node-tools">${button('edit', '<i data-lucide="pencil-line" aria-hidden="true"></i>', `data-id="${e(p.id)}" aria-label="视频需求" aria-expanded="${editing === 'edit' && editTarget === p.id}"`)}${button('open-work', '<i data-lucide="panels-top-left" aria-hidden="true"></i>', `data-id="${e(p.id)}" aria-label="制作工具" aria-expanded="${workspaceOpen && selected === p.id && !focusedStep}"`)}</div><small title="阶段由你手动标记；作品版本统计已登记的图片、视频等产物，不代表执行进度。">手动阶段：${e(p.stage)} · ${p.artifacts.length} 个作品版本</small></div>${editing === 'edit' && editTarget === p.id ? editor() : ''}${open && workspaceOpen && selected === p.id && !focusedStep ? workpage(p) : ''}${open ? `<div class="cc-roles" data-cc-role-video="${e(p.id)}" aria-label="${e(p.name)}的步骤与负责人">${roles(p)}</div>` : ''}</article>`
  }
  function projectObject(root) {
    const videos = children(root).filter((v) => root.archived || v.archived === archived)
    const open = expanded.has(root.id)
    const managing = editTarget === root.id && ['group-menu', 'edit'].includes(editing)
    return `<section class="cc-project" data-cc-root="${e(root.id)}"><div class="cc-root"><button type="button" class="cc-project-trigger" data-action="cs-toggle" data-id="${e(root.id)}" aria-expanded="${open}"><i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i><i data-lucide="folder" aria-hidden="true"></i><strong>${e(root.name)}</strong></button><div class="cc-node-tools">${!archived ? button('new-video', '<i data-lucide="plus" aria-hidden="true"></i>', `data-id="${e(root.id)}" aria-label="新建视频" title="在此项目下新建视频" aria-expanded="${editing === 'new-video' && editParent === root.id}"`) : ''}${root.kind === 'project' ? button('group-menu', '<i data-lucide="ellipsis" aria-hidden="true"></i>', `data-id="${e(root.id)}" aria-label="项目管理" aria-haspopup="menu" title="项目需求与管理" aria-expanded="${managing}"`) : ''}</div><span class="cc-root-meta">${videos.length} 支视频${root.archived ? ' · 已归档' : ''}</span></div>${editing === 'group-menu' && editTarget === root.id ? `<div class="cc-group-menu" popover="auto" role="menu" aria-label="项目操作" data-cs-key="menu:${e(root.id)}">${button('edit', '<i data-lucide="file-pen-line" aria-hidden="true"></i>项目需求', `data-id="${e(root.id)}" role="menuitem" tabindex="-1"`)}${button('archive', '<i data-lucide="archive" aria-hidden="true"></i>' + (root.archived ? '重新打开项目' : '归档项目'), 'role="menuitem" tabindex="-1"')}${button('delete', '<i data-lucide="trash-2" aria-hidden="true"></i>移除项目记录', 'role="menuitem" tabindex="-1"')}</div>` : ''}${(editTarget === root.id && editing === 'edit' && root.kind === 'project') || (editing === 'new-video' && editParent === root.id) ? editor() : ''}${open ? `<div class="cc-videos">${videos.map(videoObject).join('')}${!videos.length && !(editing === 'new-video' && editParent === root.id) ? `<div class="cc-empty-branch"><span>添加第一支视频</span>${!archived ? button('new-video', '<i data-lucide="plus" aria-hidden="true"></i>新建视频', `data-id="${e(root.id)}"`) : ''}</div>` : ''}</div>` : ''}</section>`
  }
  function renderPage() {
    clearTimeout(statusTimer)
    clearTimeout(roleTimer)
    const list = roots()
    if (selected && !projects().some((x) => x.id === selected)) {
      selected = ''
      workspaceOpen = false
    }
    if (shotEditorId && !project()?.video?.content.shots.some((s) => s.id === shotEditorId)) {
      shotEditorId = ''
      workspaceOpen = false
    }
    const gen = ++generation
    const animate = motion
    motion = false
    setTimeout(() => hydrate(gen), 0)
    return `<div class="creation-studio cc-studio cc-outline" data-cs-motion="${animate}" aria-busy="${busy}"><header class="cs-toolbar cc-toolbar"><div class="cc-title"><h2>项目大纲</h2></div><nav class="cs-collection-tabs" aria-label="项目范围"><button type="button" data-action="cs-active-list" aria-current="${!archived ? 'page' : 'false'}">进行中 <span>${roots(false).length}</span></button><button type="button" data-action="cs-archived-list" aria-current="${archived ? 'page' : 'false'}">已归档 <span>${roots(true).length}</span></button></nav>${button('new', '<i data-lucide="plus" aria-hidden="true"></i>新建项目')}</header>${error ? `<p role="alert" class="cs-error">${e(error)}</p>` : ''}<div class="cc-viewport" tabindex="0" aria-label="项目画布，可拖动空白区域平移"><div class="cc-plane" style="zoom:${zoom}">${editing === 'new' ? editor() : ''}<div class="cc-projects">${list.map(projectObject).join('')}</div>${!list.length && editing !== 'new' ? `<div class="cs-empty cc-welcome"><i data-lucide="workflow" aria-hidden="true"></i><h3>${archived ? '暂无归档项目' : '让创意从这里展开'}</h3>${button('new', '<i data-lucide="plus" aria-hidden="true"></i>创建项目', '', true)}</div>` : ''}</div></div><div class="cc-canvas-tools" role="group" aria-label="画布视图"><div role="group" aria-label="画布缩放">${button('zoom-out', '−', 'aria-label="缩小画布"')}<output data-cc-zoom>${Math.round(zoom * 100)}%</output>${button('zoom-in', '+', 'aria-label="放大画布"')}${button('reset-view', '重置视图')}</div></div></div>`
  }
  function handleChange(element) {
    const key = element.dataset.csField,
      value = element.value
    if (
      !['artifact', 'compare', 'artifactId', 'filterStatus', 'filterPriority', 'sort'].includes(key)
    )
      return false
    capture()
    if (key === 'artifact' || key === 'artifactId') artifactId = value
    if (key === 'compare') compareId = value
    if (key === 'filterStatus') filterStatus = value
    if (key === 'filterPriority') filterPriority = value
    if (key === 'sort') sort = value
    render()
    document.querySelector(`[data-cs-field="${key}"]`)?.focus()
    return true
  }
  async function hydrate(gen) {
    const root = document.querySelector('.creation-studio'),
      p = project()
    if (!root || gen !== generation) return
    events?.abort()
    events = new AbortController()
    const signal = events.signal
    for (const form of root.querySelectorAll('[data-cs-form]')) {
      if (form.dataset.csForm === 'project') continue
      const draft = drafts.get(draftKey(form.dataset.csForm))
      if (draft)
        for (const input of form.querySelectorAll('[data-cs-field]')) {
          if (draft[input.dataset.csField] !== undefined) input.value = draft[input.dataset.csField]
        }
    }
    root.addEventListener(
      'keydown',
      (event) => {
        if (handleTreeKey(event, root)) return
        const menu = root.querySelector('.cs-more[open]')
        if (event.key === 'Escape' && menu) {
          menu.open = false
          menu.querySelector('summary')?.focus()
        }
      },
      { signal },
    )
    root.addEventListener(
      'click',
      (event) => {
        const menu = root.querySelector('.cs-more[open]')
        if (menu && (!menu.contains(event.target) || event.target.closest('button')))
          menu.open = false
      },
      { signal },
    )
    hydrateCanvas(root, signal)
    hydrateCreationStagePicker(root, signal)
    hydrateCreationProjectMenu(root, signal, () => {
      if (editing !== 'group-menu') return
      editing = ''
      render()
    })
    root.addEventListener(
      'input',
      (event) => {
        const form = event.target.closest('[data-cs-form]')
        if (form) drafts.set(draftKey(form.dataset.csForm), values(form.dataset.csForm))
      },
      { signal },
    )
    for (const thumb of root.querySelectorAll('[data-cs-thumbnail]')) {
      const item = projects().find((x) => x.id === thumb.dataset.csThumbnail)
      const image = item?.artifacts.filter((x) => x.type === 'image').at(-1)
      const cached = thumbnails.get(item?.id)
      if (
        image &&
        (!cached ||
          cached.artifactId !== image.id ||
          cached.digest !== image.digest ||
          cached.stale)
      )
        api
          .creationPreview(item.id, image.id)
          .then((data) => {
            if (gen === generation && data.status === 'available') {
              thumbnails.set(item.id, { artifactId: image.id, digest: image.digest, url: data.url })
              if (thumb.querySelector('img')?.getAttribute('src') !== data.url)
                thumb.innerHTML = '<img alt="" src="' + e(data.url) + '">'
            }
          })
          .catch(() => {})
    }
    const refreshRoles = async () => {
      if (gen !== generation || state.page !== 'creation' || !root.isConnected) return
      const visible = [...root.querySelectorAll('[data-cc-role-video]')]
        .map((node) => projects().find((x) => x.id === node.dataset.ccRoleVideo))
        .filter((x) => x?.video)
      await Promise.allSettled(visible.map((item) => updateRoles(root, item, gen)))
      if (gen === generation && state.page === 'creation')
        roleTimer = setTimeout(refreshRoles, 30000)
    }
    void refreshRoles()
    if (!p) return
    if (workspaceOpen && tab === 'video') await videoPage.hydrate(p)
    try {
      const details = await api.creationDetails(p.id)
      if (gen !== generation) return
      const dir = root.querySelector('[data-cs-directory]')
      if (dir && details.directoryStatus !== 'connected')
        dir.textContent =
          details.directoryStatus === 'disconnected'
            ? '尚未关联制作目录'
            : '关联目录已失效，请重新连接'
      for (const node of root.querySelectorAll('[data-cs-run]')) {
        const run = details.runs.find((r) => r.id === node.dataset.csRun)
        node.querySelector('[data-cs-run-state]').textContent =
          statuses[run?.displayStatus] || '状态待确认'
      }
      for (const [id, valid] of Object.entries(details.reviewHealth || {})) {
        if (!valid) {
          const card = root.querySelector('[data-cs-review="' + CSS.escape(id) + '"]')
          if (card)
            card.insertAdjacentHTML(
              'afterbegin',
              '<p role="status">修复文件改变或丢失，需重新复查；原解决记录保留。</p>',
            )
        }
      }
    } catch (err) {
      if (gen === generation) toast(err.message, 'error')
    }
    const updateStatus = async () => {
      if (gen !== generation || state.page !== 'creation') return
      try {
        const fresh = await api.creationDetails(p.id)
        if (gen !== generation) return
        for (const node of root.querySelectorAll('[data-cs-run]')) {
          const run = fresh.runs.find((r) => r.id === node.dataset.csRun)
          node.querySelector('[data-cs-run-state]').textContent =
            statuses[run?.displayStatus] || '状态待确认'
        }
      } catch {
        /* A subsequent manual refresh reports the error. */
      }
      if (gen === generation && state.page === 'creation')
        statusTimer = setTimeout(updateStatus, 30000)
    }
    statusTimer = setTimeout(updateStatus, 30000)
    await Promise.all(
      [...root.querySelectorAll('[data-cs-preview]')].map(async (node) => {
        const a = p.artifacts.find((a) => a.id === node.dataset.artifact)
        try {
          const data = await api.creationPreview(p.id, a.id)
          if (gen !== generation) return
          node.querySelector('[data-cs-acceptance]').textContent =
            data.status === 'available' &&
            a.acceptance === 'approved' &&
            !p.reviews.some(
              (r) =>
                r.priority === 'required' &&
                r.status !== 'resolved' &&
                p.artifacts.find((x) => x.id === r.artifactId)?.family === a.family,
            ) &&
            a.acceptedDigest === a.digest &&
            (!p.sourceVersion || a.source !== 'external' || a.sourceVersion === p.sourceVersion)
              ? '用户已验收'
              : data.status === 'available'
                ? '待用户验收'
                : '验收未生效'
          const target = node.querySelector('[data-cs-media]')
          if (
            data.status === 'available' &&
            target.dataset.loadedArtifact === a.id &&
            target.dataset.loadedDigest === a.digest &&
            target.childElementCount
          )
            return
          target.dataset.loadedArtifact = a.id
          target.dataset.loadedDigest = a.digest
          if (data.status !== 'available')
            target.innerHTML = `<p>${e(data.message || '文件不可用')}</p>`
          else if (a.type === 'image')
            target.innerHTML = `<img src="${e(data.url)}" alt="${e(a.family + ' · ' + a.label)}">`
          else if (a.type === 'audio')
            target.innerHTML = `<audio controls preload="metadata" src="${e(data.url)}" aria-label="${e(a.label)} 音频"></audio>`
          else if (a.type === 'video') {
            target.innerHTML = `<video controls preload="metadata" src="${e(data.url)}" aria-label="${e(a.label)} 视频"></video>`
            const video = target.querySelector('video')
            video.addEventListener(
              'loadedmetadata',
              () => {
                video.currentTime = Math.min(time, video.duration || time)
              },
              { once: true },
            )
            video.addEventListener(
              'error',
              () => {
                target.insertAdjacentHTML(
                  'beforeend',
                  '<p>视频无法解码，请检查文件编码或在外部播放器查看。</p>',
                )
              },
              { once: true },
            )
          } else if (a.type === 'text')
            target.innerHTML = `<pre>${e(data.text || data.message || '空文字文件')}</pre>`
          else
            target.innerHTML = `<p>本机互动作品将在外部浏览器运行。</p>${button('open', '在外部浏览器打开本机作品', `data-id="${e(a.id)}"`)}`
        } catch (err) {
          if (gen === generation) node.querySelector('[data-cs-media]').textContent = err.message
        }
      }),
    )
  }
  function hydrateCanvas(root, signal) {
    const viewport = root.querySelector('.cc-viewport')
    if (!viewport) return
    viewport.scrollLeft = panX
    viewport.scrollTop = panY
    viewport.addEventListener(
      'scroll',
      () => {
        panX = viewport.scrollLeft
        panY = viewport.scrollTop
      },
      { passive: true, signal },
    )
    let drag
    viewport.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.button !== 0 ||
          event.target.closest(
            'button,input,select,textarea,a,summary,details,video,audio,.cc-workpage,.cs-editor',
          )
        )
          return
        drag = {
          x: event.clientX,
          y: event.clientY,
          left: viewport.scrollLeft,
          top: viewport.scrollTop,
        }
        viewport.setPointerCapture(event.pointerId)
        viewport.classList.add('is-panning')
      },
      { signal },
    )
    viewport.addEventListener(
      'pointermove',
      (event) => {
        if (!drag) return
        viewport.scrollLeft = drag.left + drag.x - event.clientX
        viewport.scrollTop = drag.top + drag.y - event.clientY
      },
      { signal },
    )
    const stop = () => {
      drag = null
      viewport.classList.remove('is-panning')
    }
    viewport.addEventListener('pointerup', stop, { signal })
    viewport.addEventListener('pointercancel', stop, { signal })
  }
  async function updateRoles(root, p, gen) {
    const data = await api.creationVideoState(p.id)
    if (gen !== generation || !root.isConnected) return
    const previous = productionStates.get(p.id)
    productionStates.set(p.id, data)
    updateRoleText(root, { ...p, video: data.video })
    const signature = (value) =>
      JSON.stringify([
        value?.video.revision,
        value?.video.content,
        value?.video.jobs,
        value?.video.exports,
        value?.audits,
        value?.storyConfirmed,
        value?.designConfirmed,
      ])
    if (
      reading &&
      focusedStep &&
      workspaceOpen &&
      selected === p.id &&
      signature(previous) !== signature(data)
    )
      render()
  }
  function handleTreeKey(event, root) {
    const target = event.target
    const functionNode = target.closest('.cc-function-node')
    if (event.key === 'Escape' && reading && functionNode) {
      const trigger = functionNode.querySelector(':scope > .cc-function-row .cc-function-trigger')
      if (trigger?.getAttribute('aria-expanded') === 'true') {
        event.preventDefault()
        void handleAction('cs-function-toggle', trigger)
        trigger.focus({ preventScroll: true })
        return true
      }
    }
    if (event.key === 'Escape' && target.closest('.cc-composer,.cc-workpage')) {
      event.preventDefault()
      void handleAction(workspaceOpen ? 'cs-close-work' : 'cs-cancel-edit', target)
      return true
    }
    const node = target.closest(
      '.cc-project-trigger,.cc-video-trigger,.cc-stage,.cc-shot-trigger,.cc-function-trigger,[data-action="cs-shots-toggle"]',
    )
    if (!node) return false
    const fold =
      node.dataset.action === 'cs-stage' && node.dataset.id === 'shots'
        ? node.closest('.cc-stage-node').querySelector('[data-action="cs-shots-toggle"]') || node
        : node
    const expandable = [
      'cs-toggle',
      'cs-project',
      'cs-shots-toggle',
      'cs-stage',
      'cs-function-toggle',
    ].includes(fold.dataset.action)
    if (event.key === 'ArrowRight' && expandable) {
      event.preventDefault()
      if (fold.getAttribute('aria-expanded') === 'false')
        void handleAction(fold.dataset.action, fold)
      else if (node.classList.contains('cc-function-trigger'))
        node
          .closest('.cc-function-node')
          .querySelector(':scope > .cc-function-children .cc-function-trigger')
          ?.focus()
      else
        (
          (node.classList.contains('cc-function-trigger')
            ? node
                .closest('.cc-function-node')
                .querySelector(':scope > .cc-function-children .cc-function-trigger')
            : node.closest('.cc-stage-node')?.querySelector('.cc-function-trigger')) ||
          fold.closest('.cc-stage-node')?.querySelector('.cc-shot-trigger') ||
          fold.closest('.cc-video')?.querySelector('.cc-stage') ||
          fold.closest('.cc-project')?.querySelector('.cc-video-trigger')
        )?.focus()
      return true
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (expandable && fold.getAttribute('aria-expanded') === 'true')
        void handleAction(fold.dataset.action, fold)
      else
        (
          node
            .closest('.cc-function-node')
            ?.parentElement.closest('.cc-function-node')
            ?.querySelector(':scope > .cc-function-row .cc-function-trigger') ||
          (node.classList.contains('cc-function-trigger') &&
            node.closest('.cc-stage-node')?.querySelector('.cc-stage')) ||
          node
            .closest('.cc-shot-node')
            ?.closest('.cc-stage-node')
            ?.querySelector('[data-action="cs-shots-toggle"]') ||
          node
            .closest('.cc-stage-node')
            ?.closest('.cc-video')
            ?.querySelector('.cc-video-trigger') ||
          node.closest('.cc-video')?.closest('.cc-project')?.querySelector('.cc-project-trigger')
        )?.focus()
      return true
    }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const nodes = [
        ...root.querySelectorAll(
          '.cc-project-trigger,.cc-video-trigger,.cc-stage,.cc-shot-trigger,.cc-function-trigger,[data-action="cs-shots-toggle"]',
        ),
      ].filter((el) => el.getClientRects().length)
      const index = nodes.indexOf(node),
        next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? nodes.length - 1
              : index + (event.key === 'ArrowDown' ? 1 : -1)
      nodes[Math.max(0, Math.min(nodes.length - 1, next))]?.focus()
      return true
    }
    return false
  }
  function capture() {
    const video = document.querySelector('[data-cs-preview="main"] video')
    if (video) time = video.currentTime
  }
  function focusObject(id) {
    const key = CSS.escape(id || '')
    const node =
      document.querySelector(`.cc-video-trigger[data-id="${key}"]`) ||
      document.querySelector(`.cc-project-trigger[data-id="${key}"]`) ||
      document.querySelector('[data-action="cs-new"]')
    node?.focus({ preventScroll: true })
  }
  function focusEditorOrigin() {
    const video = CSS.escape(selected)
    const selector = shotEditorId
      ? `.cc-shot-trigger[data-video="${video}"][data-id="${CSS.escape(shotEditorId)}"]`
      : focusedStep && project()
        ? `.cc-stage[data-video="${video}"][data-id="${focusedStage(project())}"]`
        : ''
    const node = selector && document.querySelector(selector)
    if (node) {
      node.focus({ preventScroll: true })
    } else focusObject(selected)
  }
  function values(form) {
    const node = document.querySelector(`[data-cs-form="${CSS.escape(form)}"]`)
    return Object.fromEntries(
      [...node.querySelectorAll('[data-cs-field]')].map((x) => [x.dataset.csField, x.value]),
    )
  }
  async function handleAction(action, element) {
    if (!action.startsWith('cs-')) return false
    motion =
      [
        'cs-toggle',
        'cs-project',
        'cs-stage',
        'cs-shots-toggle',
        'cs-new',
        'cs-new-video',
        'cs-edit',
        'cs-close-work',
      ].includes(action) && !element?.matches?.(':focus-visible')
    if (action.startsWith('cs-v-')) {
      const handled = await videoPage.handle(action.slice(3), project(), element)
      if (action === 'cs-v-save-brief' && !videoPage.hasError()) {
        if (focusedStep) reading = true
        else workspaceOpen = false
        render()
        focusObject(selected)
      }
      return handled
    }
    if (busy) return true
    const op = action.slice(3),
      p = editing === 'group-menu' ? projects().find((x) => x.id === editTarget) : project(),
      a = p && current(p)
    capture()
    for (const form of document.querySelectorAll('[data-cs-form]'))
      drafts.set(draftKey(form.dataset.csForm), values(form.dataset.csForm))
    error = ''
    if (op === 'function-toggle') {
      const id = element.dataset.id
      if (expandedFunctions.has(id)) expandedFunctions.delete(id)
      else expandedFunctions.add(id)
      render()
      return true
    }
    if (op === 'read-step') {
      reading = true
      shotEditorId = ''
      render()
      const origin =
        readerOrigin &&
        document.querySelector(`.cc-step-tree [aria-label="${CSS.escape(readerOrigin)}"]`)
      if (origin) origin.focus({ preventScroll: true })
      else focusEditorOrigin()
      return true
    }
    if (op === 'edit-step') {
      readerOrigin = element.getAttribute?.('aria-label') || ''
      selected = element.dataset.video
      expandedVideos.add(selected)
      editing = ''
      focusedStep = true
      workspaceOpen = true
      reading = false
      outlineStage = element.dataset.stage || element.dataset.id
      editSection = element.dataset.section || ''
      tab = element.dataset.tab || (outlineStage === 'works' ? 'works' : 'video')
      shotEditorId = ''
      if (element.dataset.shot && project()?.video) {
        videoPage.selectShot(project(), element.dataset.shot)
        if (outlineStage === 'shots') {
          shotEditorId = element.dataset.shot
          shotBranches.add(selected)
        }
      }
      if (tab === 'video') videoPage.setStep(project(), element.dataset.id)
      render()
      document
        .querySelector('.cc-workpage [data-v],.cc-workpage [data-cs-field],.cv-start button')
        ?.focus({ preventScroll: true })
      return true
    }
    if (['zoom-in', 'zoom-out', 'reset-view'].includes(op)) {
      zoom =
        op === 'reset-view'
          ? 1
          : Math.max(0.6, Math.min(1.5, zoom + (op === 'zoom-in' ? 0.1 : -0.1)))
      if (op === 'reset-view') {
        panX = 0
        panY = 0
      }
      render()
      return true
    }
    if (op === 'toggle') {
      const id = element.dataset.id
      if (expanded.has(id)) {
        expanded.delete(id)
        if (selected === id || project()?.parentId === id) {
          selected = ''
          workspaceOpen = false
          editing = ''
        }
      } else expanded.add(id)
      render()
      return true
    }
    if (op === 'group-menu') {
      workspaceOpen = false
      const same = editTarget === element.dataset.id && ['group-menu', 'edit'].includes(editing)
      editTarget = element.dataset.id
      editing = same ? '' : 'group-menu'
      render()
      return true
    }
    if (op === 'new' || op === 'new-video') {
      workspaceOpen = false
      const same = editing === op && (op === 'new' || editParent === element.dataset.id)
      editing = same ? '' : op
      editTarget = ''
      editParent = op === 'new-video' ? element.dataset.id : ''
      if (editParent) expanded.add(editParent)
      else archived = false
      render()
      if (!same) document.querySelector('[data-cs-field="name"]')?.focus({ preventScroll: true })
      return true
    }
    if (op === 'edit') {
      workspaceOpen = false
      const same = editing === 'edit' && editTarget === (element.dataset.id || selected)
      editTarget = element.dataset.id || selected
      const target = projects().find((x) => x.id === editTarget)
      if (target?.kind !== 'project') selected = editTarget
      if (target) expanded.add(target.parentId || target.id)
      editing = same ? '' : 'edit'
      render()
      if (!same) document.querySelector('[data-cs-field="name"]')?.focus({ preventScroll: true })
      return true
    }
    if (op === 'cancel-edit') {
      editing = ''
      render()
      focusObject(editTarget)
      return true
    }
    if (op === 'close-work') {
      workspaceOpen = false
      render()
      focusEditorOrigin()
      return true
    }
    if (op === 'project') {
      const id = element.dataset.id
      if (expandedVideos.has(id)) {
        expandedVideos.delete(id)
        if (selected === id) {
          selected = ''
          workspaceOpen = false
          shotEditorId = ''
        }
        if (editTarget === id) editing = ''
      } else {
        expandedVideos.add(id)
        if (!workspaceOpen && !editing) selected = id
      }
      render()
      return true
    }
    if (op === 'shots-toggle') {
      const id = element.dataset.id
      reading = false
      if (shotBranches.has(id)) {
        shotBranches.delete(id)
        if (selected === id && shotEditorId) {
          workspaceOpen = false
          shotEditorId = ''
        }
      } else shotBranches.add(id)
      render()
      return true
    }
    if (op === 'shot-open') {
      const id = element.dataset.video,
        item = projects().find((x) => x.id === id)
      if (!item?.video?.content.shots.some((s) => s.id === element.dataset.id)) return true
      const same = selected === id && workspaceOpen && shotEditorId === element.dataset.id
      selected = id
      reading = false
      outlineStage = 'shots'
      editSection = ''
      editing = ''
      focusedStep = true
      tab = 'video'
      workspaceOpen = !same
      expandedVideos.add(id)
      shotBranches.add(id)
      shotEditorId = same ? '' : element.dataset.id
      videoPage.selectShot(item, element.dataset.id)
      render()
      return true
    }
    if (op === 'open-work' || op === 'stage') {
      const id = element.dataset.video || element.dataset.id
      const sameStage =
        selected === id &&
        focusedStep &&
        workspaceOpen &&
        !shotEditorId &&
        focusedStage(project()) === element.dataset.id
      const sameWorkspace = selected === id && workspaceOpen && !focusedStep && !editing
      selected = id
      expandedVideos.add(id)
      artifactId = ''
      compareId = ''
      time = 0
      editing = ''
      shotEditorId = ''
      workspaceOpen = !((op === 'stage' && sameStage) || (op === 'open-work' && sameWorkspace))
      focusedStep = op === 'stage'
      reading = focusedStep
      outlineStage = focusedStep ? element.dataset.id : ''
      editSection = ''
      tab = op === 'stage' && element.dataset.id === 'works' ? 'works' : 'video'
      if (op === 'stage' && tab === 'video') videoPage.setStep(project(), element.dataset.id)
      render()
      return true
    }
    if (op === 'active-list' || op === 'archived-list') {
      archived = op === 'archived-list'
      selected = ''
      workspaceOpen = false
      editing = ''
      render()
      return true
    }
    if (op === 'tab') {
      focusedStep = false
      tab = element.dataset.id
      workspaceOpen = true
      render()
      document.querySelector(`.cs-tabs [data-id="${tab}"]`)?.focus()
      return true
    }
    if (op === 'latest') {
      artifactId = p.artifacts.at(-1).id
      tab = 'works'
      render()
      return true
    }
    if (op === 'capture-time') {
      document.querySelector('[data-cs-field="time"]').value = time.toFixed(2)
      return true
    }
    if (op === 'sync-time') {
      time = Number(document.querySelector('[data-cs-field="seek"]').value) || 0
      for (const video of document.querySelectorAll('video'))
        video.currentTime = Math.min(time, video.duration || time)
      return true
    }
    if (op === 'locate') {
      const r = p.reviews.find((x) => x.id === element.dataset.id)
      artifactId = r.artifactId
      const draft = drafts.get(selected + ':review')
      if (draft) draft.artifactId = r.artifactId
      time = r.time
      render()
      const video = document.querySelector(
        `[data-cs-preview="main"][data-artifact="${CSS.escape(r.artifactId)}"] video`,
      )
      if (video) video.currentTime = Math.min(time, video.duration || time)
      return true
    }
    busy = true
    const root = document.querySelector('.creation-studio')
    root?.setAttribute('aria-busy', 'true')
    for (const node of root?.querySelectorAll('button') || []) node.disabled = true
    try {
      let result
      const command = (data) => api.creationCommand({ projectId: p?.id, ...data })
      if (op === 'save-project') {
        result = await command({
          ...values('project'),
          projectId: editTarget || p?.id,
          action: editing === 'edit' ? 'edit' : 'create',
          kind: editing === 'new' ? 'project' : 'video',
          parentId: editParent,
        })
        drafts.delete(draftKey('project'))
        const saved = result.creationProjects[0]
        editTarget = saved.id
        if (saved.kind === 'project') {
          expanded.add(saved.id)
          selected = ''
        } else {
          selected = saved.id
          expanded.add(saved.parentId || saved.id)
        }
        workspaceOpen = false
        editing = ''
      }
      if (op === 'connect') result = await api.creationConnect(p.id)
      if (op === 'refresh') {
        const cached = thumbnails.get(p.id)
        if (cached) cached.stale = true
        result = await api.creationRefresh(p.id)
      }
      if (op === 'import')
        result = await api.creationImport(
          p.id,
          document.querySelector('[data-cs-field="versionLabel"]')?.value || '',
          document.querySelector('[data-cs-field="family"]')?.value || a?.family || '作品',
        )
      if (op === 'archive') {
        result = await command({ action: 'archive', archived: !p.archived })
        selected = ''
        editing = ''
      }
      if (op === 'delete') {
        if (await api.creationConfirmRemoval(p.id)) {
          result = await command({ action: 'delete' })
          selected = ''
          editing = ''
        }
      }
      if (op === 'select' || op === 'approve')
        result = await command({ action: op, artifactId: a.id })
      if (op === 'add-review') result = await command({ ...values('review'), action: 'review-add' })
      if (op === 'update-review')
        result = await command({
          ...values(element.dataset.id),
          action: 'review-update',
          reviewId: element.dataset.id,
        })
      if (op === 'publication')
        result = await command({ ...values('publication'), action: 'publication' })
      if (op === 'observation')
        result = await command({
          ...values(element.dataset.id),
          action: 'observation',
          publicationId: element.dataset.id,
        })
      if (op === 'document') {
        const text = await api.creationDocument(p.id, element.dataset.id)
        document.querySelector('[data-cs-document]').textContent = text
        return true
      }
      if (op === 'open') await api.creationOpen(p.id, element.dataset.id)
      if (op === 'copy-feedback' || op === 'export-feedback') {
        await api.creationFeedback(
          p.id,
          { status: filterStatus, priority: filterPriority },
          op === 'export-feedback',
        )
        toast(op === 'copy-feedback' ? '修改要求已复制' : '导出对话框已完成')
      }
      if (result) {
        state.workspace = result
        const form = {
          'save-project': 'project',
          'add-review': 'review',
          publication: 'publication',
        }[op]
        if (form) drafts.delete(selected + ':' + form)
      }
    } catch (err) {
      error = err.message
      toast(err.message, 'error')
    } finally {
      busy = false
      root?.setAttribute('aria-busy', 'false')
      for (const node of root?.querySelectorAll('button') || []) node.disabled = false
      if (!error && op !== 'document') {
        render()
        if (op === 'save-project') focusObject(editTarget)
        else
          document
            .querySelector('[data-action="' + CSS.escape(action) + '"]')
            ?.focus({ preventScroll: true })
      } else {
        if (error) render()
      }
    }
    return true
  }
  return { renderPage, handleAction, handleChange }
}
