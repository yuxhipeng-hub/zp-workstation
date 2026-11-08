const briefLabels = {
  idea: '创意',
  audience: '受众',
  platform: '发布场景',
  duration: '时长',
  ratio: '画幅',
  style: '画风',
  music: '配乐',
  dialogue: '对白',
  subtitles: '字幕',
  references: '参考素材',
  mustKeep: '保留',
  forbidden: '禁用',
}
const shotLabels = {
  purpose: '叙事目的',
  story: '画面内容',
  framing: '景别',
  camera: '机位',
  movement: '运镜',
  positions: '主体位置',
  action: '动作',
  cause: '原因',
  reaction: '反应',
  motion: '运动路径',
  palette: '配色',
  entities: '角色与道具',
  continuity: '衔接',
  risks: '生成风险',
}
const promptLabels = {
  style: '画风',
  camera: '镜头',
  composition: '构图与配色',
  characters: '人物',
  action: '分段动作与时间',
  sound: '声音',
  constraints: '约束',
}
const states = {
  pass: '通过',
  fail: '未通过',
  unknown: '待核查',
  stale: '已失效',
  pending: '待审核',
  queued: '排队中',
  running: '生成中',
  submitting: '提交中',
  downloading: '下载中',
  succeeded: '已生成',
  failed: '失败',
  expired: '已过期',
  cancelled: '已取消',
  processing: '后期中',
  review: '待验收',
  approved: '已验收',
  open: '待处理',
  doing: '处理中',
  recheck: '待复查',
  resolved: '已解决',
}

export function creationStepNodes(p, step, { escapeHtml: e, preview, data = null }) {
  const v = data?.video || p.video
  const c = v?.content || {}
  const shots = c.shots || []
  const prose = (value) => (value ? `<p class="cc-reader-text">${e(value)}</p>` : '')
  const fields = (value, labels) => {
    const entries = Object.entries(labels)
      .filter(([key]) => value?.[key])
      .map(([key, label]) => `<div><dt>${label}</dt><dd>${e(value[key])}</dd></div>`)
      .join('')
    return entries ? `<dl class="cc-reader-fields">${entries}</dl>` : ''
  }
  const media = (ids, types = ['image', 'video']) =>
    [...new Set(ids.filter(Boolean))]
      .map((id) => p.artifacts.find((a) => a.id === id && types.includes(a.type)))
      .filter(Boolean)
  const pictures = (items, key) =>
    items.length
      ? `<div class="cc-reader-media">${items.map((a) => preview(p, a, 'tree-' + step + '-' + key + '-' + a.id)).join('')}</div>`
      : ''
  const node = (id, label, html = '', meta = '', edit = {}) => ({
    id,
    label,
    html,
    meta: meta || (html ? '' : '未填写'),
    edit: { step, ...edit },
  })
  const list = (items, render) =>
    items.length ? `<div class="cc-reader-records">${items.map(render).join('')}</div>` : ''
  const shotName = (s, i) => `镜头 ${String(i + 1).padStart(2, '0')} · ${s.purpose || '未命名'}`
  const shotNode = (s, i) => ({
    id: 'shot:' + s.id,
    label: shotName(s, i),
    meta: `${s.duration} 秒`,
    children: [
      node('shot-content:' + s.id, '镜头内容', fields(s, shotLabels), '', {
        step: 'shots',
        shotId: s.id,
        section: 'shot',
      }),
      node('shot-prompt:' + s.id, '提示词', fields(s.prompt, promptLabels), '', {
        step: 'shots',
        shotId: s.id,
        section: 'prompt',
      }),
    ],
  })
  const designs = c.designs || []
  const design = (id, label, type, text) => {
    const records = designs.filter((d) => d.type === type)
    const html =
      prose(text) +
      list(
        records,
        (d) =>
          `<article><h4>${e(d.name || d.id)}</h4>${fields(d, { appearance: '外观', clothes: '服装', accessories: '配件', laterality: '左右特征', expressions: '表情' })}${pictures(media(d.references || []), d.id)}</article>`,
      )
    return node(id, label, html, records.length ? `${records.length} 项` : text ? '' : '未填写')
  }
  const audits = v?.audits?.filter((a) => !a.shotId.startsWith('export:')) || []
  const latestAudits = shots
    .map((s) => ({
      shot: s,
      audit: audits.filter((a) => a.shotId === s.id).at(-1),
      state: data?.audits?.find((a) => a.shotId === s.id)?.status,
    }))
    .filter((a) => a.audit)
  const checks = latestAudits.flatMap(({ shot, audit, state }) =>
    audit.checks
      .filter((check) => check.result !== 'pass')
      .map((check) => ({ ...check, shot, state })),
  )
  const films = media(v?.exports.map((r) => r.artifactId) || [], ['video'])
  const finalFilms = films.length
    ? films
    : media(
        [p.selectedArtifactId, ...p.artifacts.filter((a) => a.type === 'video').map((a) => a.id)],
        ['video'],
      )
  const summary = p.brief || p.goal
  const audio =
    v?.edit?.audioArtifactId || v?.edit?.clips.length
      ? { ...v.edit, audioMode: v.edit.audioMode === 'replace' ? '替换原音' : '混合原音' }
      : null
  const frame = (s, id, label, key) =>
    `<section><h4>${label}</h4>${pictures(media([id], ['image']), key + s.id) || `<span class="cc-function-meta">${id ? '版本不存在' : '未绑定'}</span>`}</section>`
  const reviews = () =>
    list(
      p.reviews,
      (r) =>
        `<article><h4>${r.time == null ? '全局意见' : e(r.time) + ' 秒'} · ${e(states[r.status] || r.status)}</h4>${prose(r.problem)}${r.expected ? `<p class="cc-reader-text">${e(r.expected)}</p>` : ''}</article>`,
    )
  const definitions = {
    story: () => [
      node(
        'brief',
        '创作简报',
        fields(c.brief, briefLabels) + (summary !== c.brief?.idea ? prose(summary) : ''),
        '',
        {
          step: 'brief',
        },
      ),
      node(
        'story',
        '故事正文',
        prose(c.story),
        data?.storyConfirmed ? '已确认' : c.story ? '待确认' : '未填写',
      ),
    ],
    shots: () =>
      shots.length
        ? shots.map(shotNode)
        : [node('shots-empty', '镜头', '', '0 个', { step: 'shots' })],
    design: () => [
      node(
        'style',
        '画风与色表',
        fields(c, { style: '画风', colors: '色表' }) + pictures(media(c.references || []), 'style'),
      ),
      design('characters', '角色设定', 'character', c.characters),
      design('scenes', '场景设定', 'scene', c.scenes),
      design('props', '道具设定', 'prop', c.props),
      {
        id: 'frames',
        label: '首尾帧',
        meta: `${shots.length} 个镜头`,
        children: shots.map((s, i) =>
          node(
            'frames:' + s.id,
            shotName(s, i),
            s.firstFrame || s.lastFrame
              ? `<div class="cc-reader-media">${frame(s, s.firstFrame, '首帧', 'first-')}${frame(s, s.lastFrame, '尾帧', 'last-')}</div>`
              : '',
            s.firstFrame || s.lastFrame ? '' : '未绑定',
            { step: 'design', shotId: s.id },
          ),
        ),
      },
    ],
    audit: () => [
      node(
        'audit-results',
        '审核结论',
        list(
          latestAudits,
          ({ shot, audit, state }) =>
            `<article><h4>${e(shot.purpose || shot.id)} · ${e(states[state] || '待核查')}</h4>${prose(audit.summary)}</article>`,
        ),
        `${latestAudits.length} 项`,
      ),
      node(
        'audit-issues',
        '待处理问题',
        list(
          checks,
          (check) =>
            `<article><h4>${e(check.shot.purpose || check.shot.id)} · ${e(check.check)}${check.state === 'stale' ? ' · 已失效' : ''}</h4>${prose(check.issue)}${prose(check.location)}${prose(check.suggestion)}</article>`,
        ),
        `${checks.length} 项`,
      ),
    ],
    generate: () => [
      node(
        'generation-tasks',
        '镜头任务',
        list(
          v?.jobs || [],
          (j) =>
            `<article><h4>${e(shots.find((s) => s.id === j.shotId)?.purpose || j.shotId)} · ${e(states[j.status] || j.status)}</h4>${prose(j.error)}</article>`,
        ),
        `${v?.jobs.length || 0} 项`,
      ),
      node(
        'generation-results',
        '生成结果',
        pictures(
          media(
            [...(v?.jobs.map((j) => j.artifactId) || []), ...shots.map((s) => s.video)],
            ['video'],
          ),
          'results',
        ),
        `${media([...(v?.jobs.map((j) => j.artifactId) || []), ...shots.map((s) => s.video)], ['video']).length} 个版本`,
      ),
    ],
    edit: () => [
      node(
        'editing',
        '剪辑',
        list(
          v?.edit.clips || [],
          (clip) =>
            `<article><h4>${e(shots.find((s) => s.id === clip.shotId)?.purpose || clip.shotId)}</h4><p class="cc-reader-text">${e(clip.in)}–${e(clip.out)} 秒</p>${pictures(media([clip.artifactId], ['video']), clip.shotId)}</article>`,
        ),
        `${v?.edit.clips.length || 0} 段`,
      ),
      node(
        'sound',
        '声音与字幕',
        fields(audio, { audioMode: '音轨处理', audioVolume: '配乐音量' }) +
          prose(p.artifacts.find((a) => a.id === v?.edit.audioArtifactId)?.label) +
          list(
            (v?.edit.clips || []).filter((clip) => clip.subtitle),
            (clip) => prose(clip.subtitle),
          ),
      ),
      node('films', '成片', pictures(films, 'films'), `${films.length} 个版本`),
    ],
    works: () => [
      node(
        'film-preview',
        '成片预览',
        pictures(finalFilms, 'final-films'),
        `${finalFilms.length} 个版本`,
        { tab: 'works' },
      ),
      node(
        'reviews',
        '修改意见',
        reviews(),
        `${p.reviews.filter((r) => r.status !== 'resolved').length} 条待处理`,
        { tab: 'reviews' },
      ),
      node(
        'acceptance',
        '验收结果',
        list(
          p.artifacts.filter((a) => a.acceptance === 'approved'),
          (a) => `<article><h4>${e(a.family)} · ${e(a.label)}</h4></article>`,
        ),
        `${p.artifacts.filter((a) => a.acceptance === 'approved').length} 个已验收`,
        { tab: 'works' },
      ),
    ],
  }
  return definitions[step]?.() || []
}

export function renderCreationStepTree(p, step, options, expanded) {
  const e = options.escapeHtml
  const render = (nodes, depth = 1) =>
    nodes
      .map((node) => {
        const id = `${p.id}:${step}:${node.id}`
        const open = expanded.has(id)
        const children = node.children
        const edit = node.edit
        return `<div class="cc-function-node" data-cs-key="function:${e(id)}" data-function="${e(node.id)}"><div class="cc-function-row"><button type="button" class="cc-function-trigger" data-action="cs-function-toggle" data-id="${e(id)}" aria-expanded="${open}" aria-controls="function-${e(id)}"><i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i><span>${e(node.label)}</span></button>${node.meta ? `<span class="cc-function-meta">${e(node.meta)}</span>` : ''}${edit ? `<button type="button" class="cc-function-edit" data-action="cs-edit-step" data-video="${e(p.id)}" data-id="${e(edit.step)}" data-stage="${e(step)}" data-tab="${e(edit.tab || 'video')}" data-shot="${e(edit.shotId || '')}" data-section="${e(edit.section || '')}" aria-label="编辑${e(node.label)}" title="编辑${e(node.label)}"><i data-lucide="pencil-line" aria-hidden="true"></i></button>` : ''}</div>${open ? `<div class="${children ? 'cc-function-children' : 'cc-function-content'}" id="function-${e(id)}" data-cs-key="function-body:${e(id)}">${children ? render(children, depth + 1) : node.html}</div>` : ''}</div>`
      })
      .join('')
  return `<div class="cc-function-tree" aria-label="${e({ story: '故事策划', shots: '分镜与提示词', design: '设定与首尾帧', audit: '独立审核', generate: '视频生成', edit: '后期制作', works: '最终验收' }[step])}内容">${render(creationStepNodes(p, step, options))}</div>`
}
