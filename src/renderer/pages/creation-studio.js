import { createCreationVideo } from './creation-video.js'
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
  const videoPage = createCreationVideo({ state, api, escapeHtml: e, render, toast, preview })
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
  const projects = () => state.workspace?.creationProjects || []
  const project = () => projects().find((x) => x.id === selected)
  const current = (p) =>
    p.artifacts.find((a) => a.id === artifactId) ||
    p.artifacts.find((a) => a.id === p.selectedArtifactId) ||
    p.artifacts.at(-1)
  const stamp = (value) =>
    value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未提供'
  const button = (action, label, data = '', primary = false) =>
    `<button type="button" class="button ${primary ? 'primary' : 'secondary'}" data-action="cs-${action}" ${data} ${busy ? 'disabled' : ''}>${label}</button>`
  const options = (items, value) =>
    items
      .map(([v, l]) => `<option value="${e(v)}" ${v === value ? 'selected' : ''}>${e(l)}</option>`)
      .join('')
  const field = (name, label, value = /** @type {string | number} */ (''), type = 'text') =>
    `<label>${label}<input data-cs-field="${name}" type="${type}" value="${e(value ?? '')}" ${type === 'number' ? 'min="0" step="any"' : ''}></label>`
  const area = (name, label, value = '') =>
    `<label>${label}<textarea data-cs-field="${name}" rows="3">${e(value)}</textarea></label>`
  const select = (name, label, items, value = '') =>
    `<label>${label}<select data-cs-field="${name}" aria-label="${e(label)}">${options(items, value)}</select></label>`
  const versions = (p) => p.artifacts.map((a) => [a.id, `${a.family} · ${a.label}`])
  function editor(p) {
    const x = editing === 'new' ? { name: '', goal: '', brief: '', stage: '选题' } : p
    return `<section class="cs-panel cs-editor"><h2>${editing === 'new' ? '新建项目' : '制作简报'}</h2><p>填写目标即可开始。简报可记录受众、时长、风格与交付要求。</p><div data-cs-form="project">${field('name', '项目名称', x.name)}${field('goal', '一句话目标', x.goal)}${select(
      'stage',
      '制作阶段',
      stages.map((x) => [x, x]),
      x.stage,
    )}${area('brief', '制作简报', x.brief)}<div class="cs-actions">${button('save-project', '保存项目', '', true)}${button('cancel-edit', '取消')}</div></div></section>`
  }
  function preview(p, a, slot = 'main') {
    if (!a)
      return `<div class="cs-empty"><i data-lucide="film"></i><h3>尚未导入产物</h3><p>导入图片、MP4 或文字资料，在这里查看和审片。</p>${button('import', '导入第一份产物', '', true)}</div>`
    return `<figure class="cs-preview" data-cs-preview="${slot}" data-artifact="${e(a.id)}"><figcaption><strong>${e(a.family)} · ${e(a.label)}</strong><span>${a.id === p.selectedArtifactId ? '选定版本 · ' : ''}<span data-cs-acceptance>正在核对文件</span></span></figcaption><div class="cs-media" data-cs-media><p>正在核对本机文件…</p></div><div class="cs-meta">来源：${e(a.sourceVersion || '未提供')} · ${stamp(a.createdAt)}</div></figure>`
  }
  function overview(p, a) {
    const pending = p.reviews.filter((r) => r.status !== 'resolved')
    const blocked = p.tasks.filter((t) => t.status === 'blocked')
    return `<div class="cs-work"><div>${preview(p, a)}<div class="cs-summary"><div><span>最近产物</span><strong>${p.artifacts.length ? e(p.artifacts.at(-1).family + ' · ' + p.artifacts.at(-1).label) : '尚未导入产物'}</strong>${p.artifacts.length ? button('latest', '查看最新产物') : ''}</div><div><span>下一步</span><strong>${!a ? '导入产物或关联制作目录' : pending.length ? '处理意见，关联修复版本后复查' : a.acceptance !== 'approved' ? '审查作品并确认验收' : '记录发布与复盘'}</strong></div><div><span>待审查事项</span><strong>${pending.length} 条意见 · ${p.tasks.filter((t) => t.status === 'review').length} 项任务</strong></div><div><span>阻塞问题</span><strong>${blocked.length ? e(blocked.map((t) => t.blockedReason || t.goal).join('；')) : '暂无已记录的阻塞'}</strong></div></div></div><aside class="cs-panel"><h3>制作简报</h3><p class="cs-goal">${e(p.goal || '尚未填写一句话目标')}</p><p class="cs-prose">${e(p.brief || '尚未填写制作简报')}</p>${button('edit', '编辑简报')}<hr><h3>外部项目</h3><p data-cs-directory>${p.directory ? e(p.directory) : '外部目录未连接'}</p><div class="cs-actions">${button('connect', p.directory ? '重新关联目录' : '关联目录')}${button('refresh', '刷新项目记录')}</div><p class="cs-hint">手动读取 workbench-record.json；不会启动脚本或模型。</p><details><summary>关联资料（仅供阅读）</summary><div class="cs-actions">${['BRIEF.md', 'HANDOFF.md', 'QA.md', 'README.md'].map((name) => button('document', name, `data-id="${name}"`)).join('')}</div><pre data-cs-document>选择一份资料查看。资料正文不作为执行状态。</pre></details><details><summary>任务与执行详情</summary>${executions(p)}</details><details><summary>最近活动</summary>${
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
    return `<div class="cs-panel cs-actions">${field('versionLabel', '导入版本标签（可留空）')}${field('family', '作品分组', a?.family || '作品')}${button('import', '导入产物', '', true)}<span class="cs-hint">保留原文件，新增版本不会覆盖旧记录。</span></div><div class="cs-version-bar">${select('artifact', '查看版本', versions(p), a?.id)}${select('compare', '对比版本', [['', '不比较'], ...versions(p).filter(([id]) => id !== a?.id)], compareId)}${a ? button('select', '设为选定版本') + button('approve', '确认当前版本验收') : ''}</div><div class="cs-comparison ${other ? 'is-comparing' : ''}">${preview(p, a)}${other ? preview(p, other, 'compare') : ''}</div>${other ? `<div class="cs-actions">${field('seek', '同步时间点（秒）', time, 'number')}${button('sync-time', '两版定位到相同时间')}</div>` : ''}<details class="cs-panel"><summary>版本记录与原文件</summary>${p.artifacts.map((x) => `<p>${e(x.family)} · ${e(x.label)} · ${stamp(x.createdAt)}<small>${e(x.path || x.url)}<br>SHA-256：${e(x.digest || '未提供')}</small>${button('open', x.type === 'interactive' ? '在外部浏览器打开本机作品' : '外部打开文件', `data-id="${e(x.id)}"`)}</p>`).join('')}</details>`
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
          )}${select('resolvedArtifactId', '修复版本', [['', '尚未关联'], ...versions(p)], r.resolvedArtifactId)}${button('update-review', '保存处理记录', `data-id="${e(r.id)}"`)}<small>“已解决”表示你已复查所选修复版本；原始意见会保留。</small><details><summary>处理历史</summary>${r.history.map((h) => `<p>${stamp(h.at)} · ${statuses[h.status] || h.status} · ${e(p.artifacts.find((a) => a.id === h.artifactId)?.label || '未关联版本')}</p>`).join('') || '<p>暂无处理记录</p>'}</details></article>`
        })
        .join('') || '<p class="cs-empty-small">暂无符合条件的意见</p>'
    }</aside></div>`
  }
  function publications(p) {
    return `<div class="cs-work"><section class="cs-panel" data-cs-form="publication"><h3>记录发布与复盘</h3>${field('platform', '发布平台')}${field('url', '作品链接')}${field('publishedAt', '实际发布时间', '', 'datetime-local')}${select('artifactId', '对应成片版本', [['', '选择版本'], ...versions(p)])}${field('hours', '制作耗时（小时）', '', 'number')}${field('cost', '额外支出（元）', '', 'number')}${area('notes', '经验与复盘')}${button('publication', '保存发布记录', '', true)}<p class="cs-hint">手动记录；不会登录平台或自动发布。</p></section><section class="cs-panel"><h3>发布记录与观察快照</h3>${p.publications.map((pub) => `<article class="cs-review"><h4>${e(pub.platform)}</h4><p>${stamp(pub.publishedAt)} · ${e(p.artifacts.find((a) => a.id === pub.artifactId)?.label || '')}</p><p>${e(pub.url)}</p><p>耗时 ${pub.hours ?? '未知'} 小时 · 支出 ${pub.cost ?? '未知'} 元</p><p class="cs-prose">${e(pub.notes)}</p><details><summary>添加一次观察快照</summary><div data-cs-form="${e(pub.id)}">${field('observedAt', '数据观察时间', '', 'datetime-local')}${['views', 'likes', 'comments', 'shares', 'favorites', 'followers'].map((k, i) => field(k, ['播放', '点赞', '评论', '分享', '收藏', '新增关注'][i], '', 'number')).join('')}${button('observation', '保存独立快照', `data-id="${e(pub.id)}"`)}</div></details>${pub.observations.map((o) => `<p>${stamp(o.observedAt)}<small>播放 ${o.views ?? '未知'} · 赞 ${o.likes ?? '未知'} · 评论 ${o.comments ?? '未知'} · 分享 ${o.shares ?? '未知'} · 收藏 ${o.favorites ?? '未知'} · 新增关注 ${o.followers ?? '未知'}</small></p>`).join('') || '<p>暂无观察快照；未知指标留空。</p>'}</article>`).join('') || '<p>暂无发布记录</p>'}</section></div>`
  }
  function renderPage() {
    clearTimeout(statusTimer)
    const list = projects().filter((x) => x.archived === archived)
    if (!list.some((p) => p.id === selected)) selected = list[0]?.id || ''
    const p = project(),
      a = p && current(p)
    const gen = ++generation
    setTimeout(() => hydrate(gen), 0)
    return `<div class="creation-studio" aria-busy="${busy}"><div class="cs-toolbar"><div><span class="cs-eyebrow">CREATION / LOCAL</span><h2>作品有版本，修改有来处。</h2></div><div class="cs-actions">${button('archive-list', archived ? '返回活跃项目' : '查看归档')}${button('new', '新建项目', '', true)}</div></div>${error ? `<p role="alert" class="cs-error">${e(error)}</p>` : ''}${editing ? editor(p) : ''}<div class="cs-shell"><nav class="cs-projects" aria-label="创作项目">${list.map((x) => `<button type="button" data-action="cs-project" data-id="${e(x.id)}" aria-current="${x.id === selected ? 'true' : 'false'}"><span class="cs-thumbnail" aria-hidden="true" data-cs-thumbnail="${e(x.id)}"><i data-lucide="${x.artifacts.some((a) => a.type === 'video') ? 'film' : 'image'}"></i></span><span><strong>${e(x.name)}</strong><small>${x.stage} · ${x.reviews.filter((r) => r.status !== 'resolved').length} 待处理</small><small>${stamp(x.updatedAt)}</small></span></button>`).join('') || '<p>暂无' + (archived ? '归档' : '') + '项目</p>'}</nav><main class="cs-detail">${
      !p
        ? `<div class="cs-empty"><i data-lucide="clapperboard"></i><h3>${archived ? '暂无归档项目' : '从第一份创作开始'}</h3><p>集中查看进度、作品版本与修改意见。正式工作区不会自动加入演示内容。</p>${button('new', '创建项目', '', true)}</div>`
        : `<header class="cs-project-heading"><div><span class="cs-eyebrow">${p.stage} · ${p.archived ? '已归档' : '本地保存'}</span><h2>${e(p.name)}</h2><p>${e(p.goal || '尚未填写目标')}</p><p class="cs-hint">最新状态：<span data-cs-latest>正在读取记录</span></p></div><div class="cs-actions">${button('import', '导入产物', '', true)}${button('edit', '编辑项目')}<details><summary>更多</summary>${button('archive', p.archived ? '重新打开项目' : '归档项目')}${button('delete', '移除工作室记录')}</details></div></header><nav class="cs-tabs" aria-label="项目详情">${[
            ['overview', '总览'],
            ['video', '视频制作'],
            ['works', '作品与版本'],
            ['reviews', '修改意见'],
            ['publications', '发布复盘'],
          ]
            .map(
              ([key, label]) =>
                `<button type="button" data-action="cs-tab" data-id="${key}" aria-current="${tab === key ? 'page' : 'false'}">${label}</button>`,
            )
            .join(
              '',
            )}</nav>${{ overview: () => overview(p, a), video: () => videoPage.renderPage(p), works: () => works(p, a), reviews: () => reviews(p, a), publications: () => publications(p) }[tab]()}`
    }</main></div></div>`
  }
  async function hydrate(gen) {
    const root = document.querySelector('.creation-studio'),
      p = project()
    if (!root || gen !== generation) return
    for (const form of root.querySelectorAll('[data-cs-form]')) {
      const draft = drafts.get(selected + ':' + form.dataset.csForm)
      if (draft)
        for (const input of form.querySelectorAll('[data-cs-field]')) {
          if (draft[input.dataset.csField] !== undefined) input.value = draft[input.dataset.csField]
        }
    }
    if (!p) return
    if (tab === 'video') await videoPage.hydrate(p)
    root.addEventListener('input', (event) => {
      const form = event.target.closest('[data-cs-form]')
      if (form) drafts.set(selected + ':' + form.dataset.csForm, values(form.dataset.csForm))
    })
    root.addEventListener('change', (event) => {
      const key = event.target.dataset.csField,
        value = event.target.value
      if (
        ['artifact', 'compare', 'artifactId', 'filterStatus', 'filterPriority', 'sort'].includes(
          key,
        )
      ) {
        capture()
        if (key === 'artifact' || key === 'artifactId') artifactId = value
        if (key === 'compare') compareId = value
        if (key === 'filterStatus') filterStatus = value
        if (key === 'filterPriority') filterPriority = value
        if (key === 'sort') sort = value
        render()
      }
    })
    try {
      const details = await api.creationDetails(p.id)
      if (gen !== generation) return
      const dir = root.querySelector('[data-cs-directory]')
      if (dir && details.directoryStatus !== 'connected')
        dir.textContent =
          details.directoryStatus === 'disconnected'
            ? '外部目录未连接'
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
      const latest = root.querySelector('[data-cs-latest]')
      if (latest)
        latest.textContent = details.runs.length
          ? statuses[details.runs.at(-1).displayStatus]
          : '暂无执行记录'
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
        const latest = root.querySelector('[data-cs-latest]')
        if (latest)
          latest.textContent = fresh.runs.length
            ? statuses[fresh.runs.at(-1).displayStatus]
            : '暂无执行记录'
      } catch {
        /* A subsequent manual refresh reports the error. */
      }
      if (gen === generation && state.page === 'creation')
        statusTimer = setTimeout(updateStatus, 30000)
    }
    statusTimer = setTimeout(updateStatus, 30000)
    for (const thumb of root.querySelectorAll('[data-cs-thumbnail]')) {
      const item = projects().find((x) => x.id === thumb.dataset.csThumbnail)
      const image = item?.artifacts.filter((x) => x.type === 'image').at(-1)
      if (image)
        api
          .creationPreview(item.id, image.id)
          .then((data) => {
            if (gen === generation && data.status === 'available')
              thumb.innerHTML = '<img alt="" src="' + e(data.url) + '">'
          })
          .catch(() => {})
    }
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
  function capture() {
    const video = document.querySelector('[data-cs-preview="main"] video')
    if (video) time = video.currentTime
  }
  function values(form) {
    const node = document.querySelector(`[data-cs-form="${CSS.escape(form)}"]`)
    return Object.fromEntries(
      [...node.querySelectorAll('[data-cs-field]')].map((x) => [x.dataset.csField, x.value]),
    )
  }
  async function handleAction(action, element) {
    if (!action.startsWith('cs-')) return false
    if (action.startsWith('cs-v-')) return videoPage.handle(action.slice(3), project(), element)
    if (busy) return true
    const op = action.slice(3),
      p = project(),
      a = p && current(p)
    capture()
    for (const form of document.querySelectorAll('[data-cs-form]'))
      drafts.set(selected + ':' + form.dataset.csForm, values(form.dataset.csForm))
    error = ''
    if (op === 'new') {
      drafts.delete(selected + ':project')
      editing = 'new'
      render()
      document.querySelector('[data-cs-field="name"]')?.focus()
      return true
    }
    if (op === 'edit') {
      editing = 'edit'
      render()
      document.querySelector('[data-cs-field="name"]')?.focus()
      return true
    }
    if (op === 'cancel-edit') {
      drafts.delete(selected + ':project')
      editing = ''
      render()
      return true
    }
    if (op === 'project') {
      selected = element.dataset.id
      artifactId = ''
      compareId = ''
      time = 0
      editing = ''
      render()
      return true
    }
    if (op === 'archive-list') {
      archived = !archived
      selected = ''
      editing = ''
      render()
      return true
    }
    if (op === 'tab') {
      tab = element.dataset.id
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
          action: editing === 'new' ? 'create' : 'edit',
        })
        drafts.delete(selected + ':project')
        selected = result.creationProjects[0].id
        editing = ''
      }
      if (op === 'connect') result = await api.creationConnect(p.id)
      if (op === 'refresh') result = await api.creationRefresh(p.id)
      if (op === 'import')
        result = await api.creationImport(
          p.id,
          document.querySelector('[data-cs-field="versionLabel"]')?.value || '',
          document.querySelector('[data-cs-field="family"]')?.value || a?.family || '作品',
        )
      if (op === 'archive') {
        result = await command({ action: 'archive', archived: !p.archived })
        selected = ''
      }
      if (op === 'delete') {
        if (await api.creationConfirmRemoval(p.id)) {
          result = await command({ action: 'delete' })
          selected = ''
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
        document.querySelector('[data-action="' + CSS.escape(action) + '"]')?.focus()
      } else {
        if (error) render()
      }
    }
    return true
  }
  return { renderPage, handleAction }
}
