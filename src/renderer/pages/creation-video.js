import { renderCreationVideoContext } from '../components/creation-video-context.js'
const stages = [
  ['brief', '创意简报'],
  ['story', '故事定稿'],
  ['shots', '分镜与提示词'],
  ['design', '设定与首尾帧'],
  ['audit', '独立审核'],
  ['generate', '视频生成'],
  ['edit', '后期与交付'],
]
const briefLabels = {
  idea: '一句话创意',
  audience: '目标受众',
  platform: '发布场景',
  duration: '目标时长（秒）',
  ratio: '画幅',
  style: '画风方向',
  music: '配乐要求',
  dialogue: '对白要求',
  subtitles: '字幕要求',
  references: '参考素材说明',
  mustKeep: '必须保留',
  forbidden: '禁止出现',
}
const shotLabels = {
  story: '故事内容',
  purpose: '叙事目的',
  framing: '景别',
  camera: '机位',
  movement: '运镜',
  positions: '主体位置与画面左右',
  action: '主要动作',
  cause: '动作原因',
  reaction: '表情与反应先后',
  motion: '运动元素与路径',
  palette: '配色与明暗',
  entities: '角色与道具 ID、数量',
  continuity: '前后镜头衔接',
  risks: '生成风险',
}
const promptLabels = {
  style: '1. 画风',
  camera: '2. 镜头',
  composition: '3. 构图与配色',
  characters: '4. 人物',
  action: '5. 分段动作与时间',
  sound: '6. 声音',
  constraints: '7. 约束',
}
const status = {
  pending: '待审核',
  stale: '审核失效',
  pass: '审核通过',
  fail: '审核不通过',
  unknown: '结果待核查',
  submitting: '提交中',
  queued: '排队中',
  running: '生成中',
  downloading: '下载中',
  succeeded: '已生成',
  failed: '执行失败',
  expired: '已过期',
  cancelled: '供应商已取消',
  interrupted: '已中断',
  completed: '结果待确认',
  processing: '后期中',
  review: '待人工验收',
  'not-created': '控制台已确认未创建',
}
export function createCreationVideo({
  api,
  state,
  escapeHtml: e,
  render,
  toast,
  preview,
  onState = (_project, _data) => {},
  onShotDeleted = (_shotId) => {},
}) {
  let lastError = false
  let step = 'brief',
    shotId = '',
    info = null,
    model = '',
    snapshot = null,
    submission = null,
    busy = false,
    timer
  const drafts = new Map()
  const steps = new Map()
  let events
  const getStep = (p) => steps.get(p.id) || 'brief'
  function setStep(p, id) {
    if (!stages.some(([key]) => key === id)) return
    step = id
    steps.set(p.id, id)
    submission = null
  }
  const b = (op, label, extra = '', primary = false) =>
    `<button type="button" class="button ${primary ? 'primary' : 'secondary'}" data-action="cs-v-${op}" ${extra} ${busy ? 'disabled' : ''}>${label}</button>`
  const f = (key, label, value = '', type = 'text') =>
    `<label>${e(label)}<input aria-label="${e(label)}" data-v="${key}" type="${type}" value="${e(value ?? '')}" ${type === 'number' ? 'min="0" step="any"' : ''}></label>`
  const area = (key, label, value = '') =>
    `<label>${e(label)}<textarea aria-label="${e(label)}" data-v="${key}" data-v-autogrow rows="1">${e(value)}</textarea></label>`
  const select = (key, label, options, value = '') =>
    `<label>${e(label)}<select aria-label="${e(label)}" data-v="${key}">${options.map(([id, label]) => `<option value="${e(id)}" ${id === value ? 'selected' : ''}>${e(label)}</option>`).join('')}</select></label>`
  const form = (id, html) => `<div data-v-form="${id}" class="cv-form">${html}</div>`
  const get = (id) =>
    Object.fromEntries(
      [...document.querySelectorAll(`[data-v-form="${id}"] [data-v]`)].map((x) => [
        x.dataset.v,
        x.multiple ? [...x.selectedOptions].map((o) => o.value).join(',') : x.value,
      ]),
    )
  function draft(id, fallback) {
    return drafts.get(id) || fallback
  }
  const refs = (images, value, label = '参考图片具体版本') =>
    `<label>${e(label)}<select aria-label="${e(label)}" data-v="references" multiple size="4">${images
      .filter(([id]) => id)
      .map(
        ([id, label]) =>
          `<option value="${e(id)}" ${value.includes(id) ? 'selected' : ''}>${e(label)}</option>`,
      )
      .join('')}</select></label>`
  const sketch = (s) =>
    `<div class="cv-sketch" aria-label="色块构图草图" style="background:${e(s.backgroundColor)}"><div class="cv-ground" style="background:${e(s.accentColor)}"></div><span style="left:${Number(s.subjectX)}%;top:${Number(s.subjectY)}%;width:${Number(s.subjectScale)}%;height:${Number(s.subjectScale)}%;background:${e(s.subjectColor)}">主体</span></div>`
  function selected(p) {
    return p.video.content.shots.find((s) => s.id === shotId) || p.video.content.shots[0]
  }
  function selectShot(p, id) {
    if (!p.video?.content.shots.some((s) => s.id === id)) return false
    shotId = id
    setStep(p, 'shots')
    return true
  }
  const draftKey = (p, form) =>
    p.id +
    ':form:' +
    form +
    (['shot', 'frames', 'prompt'].includes(form) ? ':' + selected(p)?.id : '')
  function shotNav(p, editable = false) {
    const s = selected(p)
    return `<div class="cv-shot-nav">${p.video.content.shots.map((x, i) => b('shot', `${String(i + 1).padStart(2, '0')} · ${e(x.purpose || (x.story || '').slice(0, 18) || '新镜头')}`, `data-id="${e(x.id)}" aria-current="${s?.id === x.id ? 'true' : 'false'}"`)).join('')}${editable ? b('add-shot', '新增镜头') : ''}</div>`
  }
  function stepStatus(p, data, focused) {
    if (!focused || step === 'generate')
      return data
        ? `${data.progress.generated} / ${data.progress.shots} 镜头有当前版本视频`
        : '正在核对制作状态'
    const v = data?.video || p.video
    if (step === 'brief') return v.content.brief.idea ? '已有创意简报' : '待填写创意简报'
    if (step === 'story') return data?.storyConfirmed ? '故事已确认' : '故事待确认'
    if (step === 'shots') return `${v.content.shots.length} 个分镜`
    if (step === 'design') return data?.designConfirmed ? '当前设定已确认' : '设定待确认'
    if (step === 'audit')
      return status[data?.audits?.find((a) => a.shotId === selected(p)?.id)?.status] || '待审核'
    if (step === 'edit') return status[v.exports.at(-1)?.status] || '待编排与导出'
    return ''
  }
  function renderPage(p, { focused = false, shotOnly = false, section = '' } = {}) {
    clearTimeout(timer)
    step = getStep(p)
    if (!p.video)
      return `<section class="cv-start" data-cs-key="start:${p.id}:${step}"><i data-lucide="clapperboard" aria-hidden="true"></i><h3>${focused ? stages.find(([id]) => id === step)?.[1] : '从创意到成片'}</h3>${focused ? '' : `<ol>${stages.map(([, label], i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${label}</li>`).join('')}</ol>`}${b('enable', '启用视频制作流程', '', true)}</section>`
    if (snapshot?.projectId !== p.id) snapshot = null
    const v = p.video,
      c = v.content,
      s = selected(p),
      d = draft(p.id + ':' + step, {})
    const ledger = snapshot?.ledger || { settled: 0, reserved: 0, remaining: v.budget }
    let body = ''
    if (step === 'brief') {
      const value = (k) => d[k] ?? c.brief[k]
      const group = (title, html) =>
        `<fieldset class="cv-form-group"><legend>${title}</legend><div class="cv-field-grid">${html}</div></fieldset>`
      body = form(
        'brief',
        group(
          '内容与受众',
          `<div class="cv-field-wide">${area('idea', briefLabels.idea, value('idea'))}</div>${f('audience', briefLabels.audience, value('audience'))}${f('platform', briefLabels.platform, value('platform'))}`,
        ) +
          `<div class="cv-field-grid cv-field-wide">${f('duration', briefLabels.duration, value('duration'), 'number')}${f('ratio', briefLabels.ratio, value('ratio'))}</div><details class="cv-advanced"><summary>画面与声音</summary><div class="cv-field-grid">${f('style', briefLabels.style, value('style'))}${f('music', briefLabels.music, value('music'))}${f('dialogue', briefLabels.dialogue, value('dialogue'))}${f('subtitles', briefLabels.subtitles, value('subtitles'))}</div></details><details class="cv-advanced"><summary>参考与约束</summary><div class="cv-field-grid"><div class="cv-field-wide">${area('references', briefLabels.references, value('references'))}</div>${area('mustKeep', briefLabels.mustKeep, value('mustKeep'))}${area('forbidden', briefLabels.forbidden, value('forbidden'))}</div></details>` +
          b('save-brief', '保存创意简报', '', true),
      )
    }
    if (step === 'story')
      body = form(
        'story',
        area('story', '故事草稿', d.story ?? c.story) +
          `<div class="cs-actions">${b('save-story', '保存故事', '', true)}${b('confirm-story', '确认当前故事')}</div>`,
      )
    if (step === 'shots')
      body =
        (shotOnly || section ? '' : shotNav(p, true)) +
        (s && section !== 'prompt'
          ? form(
              'shot',
              `${f('purpose', '叙事目的', d.purpose ?? s.purpose)}${f('duration', '目标成片时长（秒）', d.duration ?? s.duration, 'number')}<div class="cv-field-wide">${area('story', '故事内容', d.story ?? s.story)}</div><details class="cv-advanced"><summary>画面、动作与衔接</summary><div class="cv-field-grid">${Object.entries(
                shotLabels,
              )
                .filter(([k]) => !['story', 'purpose'].includes(k))
                .map(([k, l]) => area(k, l, d[k] ?? s[k]))
                .join(
                  '',
                )}</div></details><details class="cv-advanced"><summary>时序与构图草案</summary><div class="cv-field-grid">${f('start', '成片起点（秒）', d.start ?? s.start, 'number')}${f('generationDuration', '申请生成时长（秒）', d.generationDuration ?? s.generationDuration, 'number')}${sketch(s)}${f('subjectX', '构图主体横向位置（0–100）', s.subjectX, 'number')}${f('subjectY', '构图主体纵向位置（0–100）', s.subjectY, 'number')}${f('subjectScale', '构图主体大小（5–70）', s.subjectScale, 'number')}${f('backgroundColor', '构图背景色', s.backgroundColor, 'color')}${f('subjectColor', '构图主体色', s.subjectColor, 'color')}${f('accentColor', '构图前景色', s.accentColor, 'color')}</div><small>镜头 ID：${e(s.id)}</small></details><div class="cs-actions">${b('save-shot', '保存分镜', '', true)}${b('move-up', '向前移动')}${b('move-down', '向后移动')}${b('split-shot', '拆分镜头')}${b('delete-shot', '删除镜头')}</div>`,
            )
          : '') +
        (s && section !== 'shot'
          ? `<h4>当前镜头提示词</h4>${form(
              'prompt',
              Object.entries(promptLabels)
                .map(([k, l]) => area(k, l, s.prompt[k]))
                .join('') + `${b('save-prompt', '保存提示词', '', true)}`,
            )}`
          : '') +
        (shotOnly || section || !c.shots.length
          ? ''
          : `<details><summary>全片分镜总览</summary><ol>${c.shots.map((x) => `<li><strong>${e(x.purpose || '待填目的')}</strong> · ${x.start}–${x.start + x.duration} 秒<p>${e(x.story)}</p><p>${e(x.positions)} · ${e(x.palette)}</p></li>`).join('')}</ol></details>`)
    if (step === 'design') {
      const images = [
        ['', '尚未绑定'],
        ...p.artifacts
          .filter((a) => a.type === 'image')
          .map((a) => [a.id, `${a.family} · ${a.label}`]),
      ]
      body =
        form(
          'design',
          area('style', '画风说明与少量样图确认', d.style ?? c.style) +
            area(
              'characters',
              '角色设定（稳定 ID、外貌、服装、配件、左右特征、多角度/表情）',
              d.characters ?? c.characters,
            ) +
            area('scenes', '场景设定', d.scenes ?? c.scenes) +
            area('props', '道具设定与固定数量', d.props ?? c.props) +
            area('colors', '色表与强调色', d.colors ?? c.colors) +
            refs(images, (d.references ?? c.references.join(',')).split(',')) +
            b('save-design', '保存设定', '', true) +
            b('confirm-design', '确认当前画风与设定样图'),
        ) +
        `${b('add-design-record', '添加角色 / 场景 / 道具设定')}${c.designs
          .map(
            (x) =>
              `<details class="cs-panel"><summary>${e(x.name || x.id)}</summary><p>稳定 ID ${e(x.id)}</p>${form(
                'design-record-' + x.id,
                select(
                  'type',
                  '设定类型',
                  [
                    ['character', '角色'],
                    ['scene', '场景'],
                    ['prop', '道具'],
                  ],
                  x.type,
                ) +
                  f('name', '设定名称', x.name) +
                  area('appearance', '外貌或形态', x.appearance) +
                  area('clothes', '服装或固定色彩', x.clothes) +
                  area('accessories', '固定配件', x.accessories) +
                  area('laterality', '左右特征', x.laterality) +
                  area('expressions', '多角度与表情说明', x.expressions) +
                  refs(images, x.references, '设定参考图版本') +
                  b('save-design-record', '保存本项设定', `data-id="${e(x.id)}"`),
              )}</details>`,
          )
          .join('')}` +
        shotNav(p) +
        (s
          ? form(
              'frames',
              select('firstFrame', '首帧具体版本', images, d.firstFrame ?? s.firstFrame) +
                select('lastFrame', '尾帧具体版本', images, d.lastFrame ?? s.lastFrame) +
                b('save-frames', '保存首尾帧绑定', '', true),
            ) +
            `<div class="cs-actions">${b('frames-parallel', '并排')}${b('frames-overlay', '叠加')}${b('frames-difference', '差异辅助')}</div><dialog class="cv-lightbox" aria-label="放大查看图片"><form method="dialog"><button class="button secondary">关闭图片</button></form><img alt="首尾帧放大查看"></dialog><div class="cs-comparison is-comparing cv-frames">${[
              s.firstFrame,
              s.lastFrame,
            ]
              .map((id, i) =>
                id
                  ? preview(
                      p,
                      p.artifacts.find((a) => a.id === id),
                      i ? 'compare' : 'main',
                    )
                  : '<div class="cs-empty">待导入并绑定图片</div>',
              )
              .join('')}</div>`
          : '')
    }
    if (step === 'audit') {
      const audit = snapshot?.audits?.find((a) => a.shotId === s?.id)
      body =
        shotNav(p) +
        (s
          ? `<div class="cs-actions">${b('review', '独立审核', '', true)}</div>` +
            `<section class="cs-panel"><h4>${status[audit?.status] || '待审核'}</h4><p>${e(audit?.audit?.summary || '')}</p>${audit?.audit?.checks?.map((x) => `<p><strong>${e(x.check)} · ${e(status[x.result] || x.result)}</strong> ${e(x.issue)} ${e(x.location)} ${e(x.severity)}<br>${e(x.suggestion)}</p>`).join('') || ''}</section>`
          : '')
    }
    if (step === 'generate') {
      body =
        shotNav(p) +
        (s
          ? `<section class="cs-panel"><h4>当前镜头 · ${e(s.purpose || s.id)}</h4><div class="cs-actions">${b('prepare', '检查本次提交', '', true)}</div></section>`
          : '')
      if (submission)
        body += `<section class="cs-panel cv-submit"><h4>本次将发送到火山方舟</h4><p>镜头 ${e(submission.shotId)} · ${e(submission.model)} · ${submission.duration}秒 · ${e(submission.resolution)} · ${e(submission.ratio)}</p>${submission.images.map((x) => `<p>${e(x.label)}<small>${e(x.path)}<br>SHA-256 ${e(x.digest)}</small></p>`).join('')}<pre>${e(submission.request.prompt)}</pre><p>估算 ¥${submission.estimate} · 保守预留 ¥${submission.reserve}；最终账单可能高于预留。生图和 Codex 费用另计。</p>${b('submit', '确认并提交本镜头', '', true)}${b('dismiss-submit', '关闭预览')}</section>`
      body += `<details class="cs-panel"><summary>供应商配置与预算</summary>${form(
        'provider',
        f('key', '火山方舟 API Key（仅安全存储）', '', 'password') +
          b('save-key', '安全保存 Key') +
          f('model', '模型或推理接入点 ID', v.config.model) +
          select(
            'capability',
            '模型能力档案',
            [
              ['seedance-2.5', 'Seedance 2.5'],
              ['seedance-2.0', 'Seedance 2.0'],
              ['seedance-2.0-fast', 'Seedance 2.0 fast'],
              ['seedance-2.0-mini', 'Seedance 2.0 mini'],
              ['seedance-1.0-pro', 'Seedance 1.0 pro'],
              ['seedance-1.0-fast', 'Seedance 1.0 pro fast'],
            ],
            v.config.capability || 'seedance-2.0',
          ) +
          select(
            'resolution',
            '分辨率',
            [
              ['480p', '480p'],
              ['720p', '720p'],
              ['1080p', '1080p'],
            ],
            v.config.resolution || '720p',
          ) +
          select(
            'ratio',
            '画幅',
            [
              ['adaptive', 'adaptive'],
              ['16:9', '16:9'],
              ['9:16', '9:16'],
              ['1:1', '1:1'],
            ],
            v.config.ratio || 'adaptive',
          ) +
          select(
            'audio',
            '模型生成声音',
            [
              ['false', '不生成'],
              ['true', '生成（需模型支持）'],
            ],
            String(v.config.audio),
          ) +
          f('budget', '视频生成总预算（元）', v.budget, 'number') +
          f('rate', '估算每秒费用（元）', v.config.rate, 'number') +
          f('rateSource', '估算依据与日期', v.config.rateSource) +
          f('reserveFactor', '保守预留系数', v.config.reserveFactor, 'number') +
          b('save-provider', '保存配置与预算') +
          b('check-provider', '只读连接检查'),
      )}</details><section class="cs-panel"><h4>费用账本</h4><p>预算 ¥${v.budget} · 已结算 ¥${ledger.settled.toFixed(2)} · 预留 ¥${ledger.reserved.toFixed(2)} · 可提交 ¥${ledger.remaining.toFixed(2)}</p>${v.jobs.map((j) => `<article class="cv-job"><strong>${e(j.shotId)} · ${status[j.status] || e(j.status)}</strong><p>${e(j.error)} ${j.stopped ? '本地已停止，供应商状态未因此取消' : ''}</p><small>${e(j.id)} · ${e(j.taskId || '供应商 ID 未知')} · 估算 ¥${j.estimate} / 预留 ¥${j.reserve} / 结算 ${j.settled ?? '未知'}</small>${form(j.id, f('taskId', '核查后补录供应商任务 ID', j.taskId) + f('cost', '最终账单金额（元）', j.settled ?? '', 'number'))}<div class="cs-actions">${b('poll', '查询与下载', `data-id="${e(j.id)}"`)}${b('attach-task', '补录任务 ID', `data-id="${e(j.id)}"`)}${b('cancel-provider', '尝试取消排队', `data-id="${e(j.id)}"`)}${b('settle', '按账单结算', `data-id="${e(j.id)}"`)}</div></article>`).join('') || '<p>尚无付费任务</p>'}</section>`
    }
    if (step === 'generate')
      body += v.jobs
        .filter((j) => j.status === 'unknown' && !j.taskId)
        .map(
          (j) =>
            `<section class="cs-panel"><p>未知提交 ${e(j.id)}：先在控制台核查是否创建。存在任务请补录 ID；只有确认未创建后才释放预留。</p>${b('resolve-unknown', '我已核查：未创建任务', `data-id="${e(j.id)}"`)}</section>`,
        )
        .join('')
    if (step === 'edit') {
      body = `${form(
        'export',
        f('width', '输出宽度', v.edit.width, 'number') +
          f('height', '输出高度', v.edit.height, 'number') +
          select(
            'fps',
            '帧率',
            [
              ['24', '24'],
              ['25', '25'],
              ['30', '30'],
            ],
            String(v.edit.fps),
          ) +
          select(
            'audioArtifactId',
            '配乐或对白音轨',
            [
              ['', '仅使用镜头原音'],
              ...p.artifacts
                .filter((a) => a.type === 'audio')
                .map((a) => [a.id, `${a.family} · ${a.label}`]),
            ],
            v.edit.audioArtifactId,
          ) +
          select(
            'audioMode',
            '音轨处理',
            [
              ['mix', '混合镜头原音'],
              ['replace', '替换镜头原音'],
            ],
            v.edit.audioMode,
          ) +
          f('audioVolume', '配乐音量（0–3）', v.edit.audioVolume, 'number') +
          f('audioIn', '音轨入点（秒）', v.edit.audioIn, 'number') +
          f('audioFade', '配乐淡入淡出（秒）', v.edit.audioFade, 'number'),
      )}<div class="cv-edits">${c.shots
        .map((s) => {
          const clip = v.edit.clips.find((c) => c.shotId === s.id) || {
            artifactId: s.video,
            in: 0,
            out: s.duration,
            volume: 1,
            fade: 0,
            brightness: 0,
            saturation: 1,
          }
          return `<section class="cs-panel"><h4>${e(s.purpose || s.id)}</h4>${form('clip-' + s.id, select('artifactId', '视频具体版本', [['', '不使用'], ...p.artifacts.filter((a) => a.type === 'video').map((a) => [a.id, `${a.family} · ${a.label}`])], clip.artifactId) + f('in', '片段入点（秒）', clip.in, 'number') + f('out', '片段出点（秒）', clip.out, 'number') + f('volume', '音量（0 静音，1 原音）', clip.volume, 'number') + f('fade', '画面与声音淡入淡出（秒）', clip.fade, 'number') + f('brightness', '亮度增加（0–0.2）', clip.brightness, 'number') + f('saturation', '饱和度（0–2）', clip.saturation, 'number') + area('subtitle', '片段字幕', clip.subtitle || ''))}</section>`
        })
        .join(
          '',
        )}</div><div class="cs-actions">${b('save-edit', '保存编辑决定', '', true)}${b('render', '导出并自动检查')}${b('tools', '检查后期工具')}</div>${v.exports
        .map(
          (r) =>
            `<details class="cs-panel"><summary>${status[r.status] || r.status} · ${e(r.at)}</summary><p>${e(r.error || '')}</p><p>${snapshot?.staleExports?.includes(r.id) ? '内容或剪辑已更新，本片为旧版本。' : ''}</p>${r.artifactId ? b('review-film', '独立复核此成片', `data-id="${e(r.id)}"`) : ''}${v.audits
              .filter((a) => a.shotId === 'export:' + r.id)
              .map(
                (a) =>
                  `<p>${status[a.status]} · ${e(a.summary)}</p>${a.checks.map((c) => `<p>${e(c.check)} · ${e(c.result)} ${e(c.location)} ${e(c.issue)} ${e(c.suggestion)}</p>`).join('')}`,
              )
              .join(
                '',
              )}<details><summary>自动检查与抽帧诊断</summary><pre>${e(r.report)}</pre></details><small>引用编辑决定摘要 ${e(r.digest)}</small></details>`,
        )
        .join('')}`
    }
    return `<section class="cv-workspace" data-focused="${focused}" data-cs-key="video:${p.id}:${step}"><div class="cv-heading"><div><h3>${focused ? stages.find(([id]) => id === step)?.[1] : '视频制作'}</h3><p data-v-status>${e(stepStatus(p, snapshot, focused))}</p></div><div class="cs-actions">${b('refresh', '刷新制作状态')}${!focused || ['audit', 'generate', 'edit'].includes(step) ? b('stop', '中断本地任务') : ''}</div></div>${focused ? '' : `<nav class="cv-stages" aria-label="视频制作阶段">${stages.map(([id, label], i) => b('step', `<span class="cv-step-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span>${label}</span>`, `data-id="${id}" aria-current="${step === id ? 'step' : 'false'}"`)).join('')}</nav>`}<div class="cv-detail-layout"><div class="cv-detail-editor"><div class="cv-body">${body}</div></div>${renderCreationVideoContext(p, s, step, e, preview, shotOnly)}</div>${auditTools(v)}${
      focused
        ? ''
        : `<details><summary>版本与制作文件</summary><p>${e(snapshot?.directory || '正在读取项目目录')}</p><p>内容版本 ${e(v.revision)} · 历史 ${v.history.length} 个</p>${v.history
            .slice(-10)
            .reverse()
            .map((h) => `<p>${e(h.at)} · ${e(h.id)}<small>${e(h.digest)}</small></p>`)
            .join('')}</details>`
    }</section>`
  }
  function auditTools(v) {
    if (!['audit', 'edit'].includes(step)) return ''
    const role = step === 'edit' ? 'film-reviewer' : 'reviewer'
    const sessions = v.sessions.filter((session) => session.role === role).slice(-6)
    return `<details class="cs-panel"><summary>审核模型与记录</summary><div class="cs-actions">${b('connect', '连接审核模型')}${
      info
        ? select(
            'codexModel',
            'Codex 模型',
            info.models.map((m) => [m.id, m.name || m.id]),
            model,
          )
        : ''
    }</div><pre data-v-live></pre>${sessions
      .map((session) => {
        let proposal
        try {
          proposal = JSON.parse(session.result)
        } catch {
          /* Structured results may still be pending. */
        }
        return `<article class="cv-session"><strong>${session.role === 'film-reviewer' ? '成片复核' : '独立审核'} · ${status[session.status] || e(session.status)}</strong><p>${e(session.error || '')}</p><p class="cs-prose">${e(proposal?.message || proposal?.summary || session.messages.at(-1)?.text || '等待回复')}</p><details><summary>诊断与结构化结果</summary><small>会话 ${e(session.threadId)} · 执行 ${e(session.turnId)}</small><pre>${e(session.result)}</pre></details></article>`
      })
      .join('')}</details>`
  }
  async function hydrate(p) {
    if (!p?.video) return
    const root = document.querySelector('.cv-workspace')
    if (!root) return
    events?.abort()
    events = new AbortController()
    const signal = events.signal
    root.addEventListener(
      'click',
      (event) => {
        const target = event.target
        if (target.matches('.cv-frames img')) {
          const dialog = root.querySelector('.cv-lightbox')
          dialog.querySelector('img').src = target.src
          dialog.showModal()
        }
      },
      { signal },
    )
    for (const form of root.querySelectorAll('[data-v-form]'))
      for (const [key, val] of Object.entries(draft(draftKey(p, form.dataset.vForm), {}))) {
        const field = form.querySelector(`[data-v="${CSS.escape(key)}"]`)
        if (field?.multiple) {
          for (const option of field.options)
            option.selected = String(val).split(',').includes(option.value)
        } else if (field) field.value = val
      }
    const fit = (field) => {
      if (!field?.matches('textarea[data-v-autogrow]') || !field.clientWidth) return
      field.style.height = '30px'
      const style = getComputedStyle(field)
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      field.style.height = Math.min(180, Math.max(30, field.scrollHeight + border)) + 'px'
    }
    const fitAll = () => root.querySelectorAll('[data-v-autogrow]').forEach(fit)
    fitAll()
    let previousWidth = 0
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === previousWidth) return
      previousWidth = entry.contentRect.width
      fitAll()
    })
    observer.observe(root.querySelector('.cv-detail-editor'))
    signal.addEventListener('abort', () => observer.disconnect(), { once: true })
    root.addEventListener('toggle', fitAll, { capture: true, signal })
    root.addEventListener(
      'input',
      (ev) => {
        fit(ev.target)
        if (ev.target.dataset.v && ev.target.dataset.v !== 'key') {
          const section = ev.target.closest('[data-v-form]')
          if (section) {
            const form = section.dataset.vForm
            const data = get(form)
            delete data.key
            drafts.set(draftKey(p, form), data)
          }
        }
      },
      { signal },
    )
    const update = async () => {
      if (!root.isConnected) return
      try {
        const data = await api.creationVideoState(p.id)
        if (!root.isConnected) return
        snapshot = { ...data, projectId: p.id }
        onState(p, data)
        const node = root.querySelector('[data-v-status]')
        node.textContent = stepStatus(p, data, root.dataset.focused === 'true')
        const role = step === 'edit' ? 'film-reviewer' : 'reviewer'
        const sessions = data.video.sessions.filter((session) => session.role === role)
        const last = sessions.at(-1)
        const active = data.active && sessions.some((session) => session.status === 'running')
        let resultMessage = ''
        if (last?.result) {
          try {
            const result = JSON.parse(last.result)
            resultMessage = result.message || result.summary || ''
          } catch {
            resultMessage = last.result
          }
        }
        let live = 'Codex 正在整理制作结果…'
        if (active && data.active.liveText) {
          const match = data.active.liveText.match(/"(?:message|summary)"\s*:\s*"((?:\\.|[^"\\])*)/)
          if (match) {
            try {
              live = JSON.parse('"' + match[1] + '"')
            } catch {
              /* 等待完整转义片段 */
            }
          }
        }
        const liveNode = root.querySelector('[data-v-live]')
        if (liveNode)
          liveNode.textContent =
            (active ? live : '') ||
            (last
              ? `${status[last.status] || last.status}：${last.error || resultMessage} ${!active ? '（刷新制作状态查看提案与审核详情）' : ''}`
              : '')
      } catch (err) {
        if (root.isConnected) root.querySelector('[data-v-status]').textContent = err.message
      }
      timer = setTimeout(update, 1500)
    }
    await update()
  }
  async function handle(op, p, element) {
    if (!op.startsWith('v-')) return false
    op = op.slice(2)
    if (busy && op !== 'stop') return true
    if (op.startsWith('frames-')) {
      const target = document.querySelector('.cv-frames')
      target?.classList.toggle('is-overlay', op !== 'frames-parallel')
      target?.classList.toggle('is-difference', op === 'frames-difference')
      return true
    }
    const s = p.video && selected(p)
    if (op === 'inspect-shot') {
      if (selectShot(p, element.dataset.id)) render()
      return true
    }
    if (op === 'step') {
      setStep(p, element.dataset.id)
      render()
      document.querySelector(`.cv-stages [data-id="${step}"]`)?.focus()
      return true
    }
    if (op === 'shot') {
      shotId = element.dataset.id
      drafts.delete(p.id + ':' + step)
      render()
      return true
    }
    if (op === 'dismiss-submit') {
      submission = null
      render()
      return true
    }
    busy = true
    lastError = false
    const command = (data) => api.creationVideoCommand({ projectId: p.id, ...data })
    const save = (content) => command({ action: 'save-content', content })
    let result
    try {
      const c = p.video ? structuredClone(p.video.content) : null
      if (op === 'enable') result = await command({ action: 'enable' })
      if (op === 'refresh') {
        snapshot = { ...(await api.creationVideoState(p.id)), projectId: p.id }
        state.workspace = await api.getWorkspace()
      }
      if (op === 'save-brief') {
        c.brief = get('brief')
        result = await save(c)
      }
      if (op === 'save-story') {
        c.story = get('story').story
        result = await save(c)
      }
      if (op === 'confirm-story') {
        const story = get('story').story
        if (story !== c.story) {
          c.story = story
          await save(c)
        }
        result = await command({ action: 'confirm-story' })
      }
      if (op === 'save-design') {
        const d = get('design')
        Object.assign(c, d, {
          references: d.references
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        })
        result = await save(c)
      }
      if (op === 'confirm-design') {
        const d = get('design')
        Object.assign(c, d, { references: d.references.split(',').filter(Boolean) })
        await save(c)
        result = await command({ action: 'confirm-design' })
      }
      if (op === 'add-design-record') {
        c.designs.push({ id: crypto.randomUUID(), type: 'character', references: [] })
        result = await save(c)
      }
      if (op === 'save-design-record') {
        const d = get('design-record-' + element.dataset.id)
        Object.assign(
          c.designs.find((x) => x.id === element.dataset.id),
          d,
          { references: d.references.split(',').filter(Boolean) },
        )
        result = await save(c)
      }
      if (
        ['save-shot', 'save-frames', 'save-prompt', 'move-up', 'move-down', 'split-shot'].includes(
          op,
        )
      ) {
        const i = c.shots.findIndex((x) => x.id === s.id)
        if (op === 'save-shot') Object.assign(c.shots[i], get('shot'))
        if (op === 'save-frames') Object.assign(c.shots[i], get('frames'))
        if (op === 'save-prompt') c.shots[i].prompt = get('prompt')
        if (op === 'move-up' && i > 0) [c.shots[i - 1], c.shots[i]] = [c.shots[i], c.shots[i - 1]]
        if (op === 'move-down' && i < c.shots.length - 1)
          [c.shots[i + 1], c.shots[i]] = [c.shots[i], c.shots[i + 1]]
        if (op === 'split-shot') {
          c.shots[i].duration /= 2
          c.shots.splice(i + 1, 0, {
            ...c.shots[i],
            id: crypto.randomUUID(),
            start: s.start + c.shots[i].duration,
            firstFrame: '',
            lastFrame: '',
            video: '',
          })
        }
        if (['move-up', 'move-down', 'split-shot'].includes(op)) {
          let t = 0
          for (const x of c.shots) {
            x.start = t
            t += Number(x.duration)
          }
        }
        result = await save(c)
      }
      if (op === 'add-shot') {
        shotId = crypto.randomUUID()
        c.shots.push({
          id: shotId,
          start: c.shots.reduce((n, s) => n + Number(s.duration), 0),
          duration: 5,
          generationDuration: 5,
          prompt: {},
        })
        result = await save(c)
      }
      if (op === 'delete-shot') {
        if (!s) throw new Error('镜头不存在。')
        const index = c.shots.findIndex((shot) => shot.id === s.id)
        result = await command({ action: 'delete-shot', shotId: s.id })
        const shots = result.creationProjects.find((project) => project.id === p.id).video.content
          .shots
        shotId = shots[Math.min(index, shots.length - 1)]?.id || ''
        for (const form of ['shot', 'frames', 'prompt'])
          drafts.delete(p.id + ':form:' + form + ':' + s.id)
        drafts.delete(p.id + ':form:clip-' + s.id)
        onShotDeleted(s.id)
      }
      if (op === 'connect') {
        info = await api.creationVideoConnect(p.id)
        model = info.models.find((m) => m.default)?.id || info.models[0]?.id || ''
        toast('Codex 已连接；请选择审核模型。')
      }
      if (op === 'review' || op === 'review-film') {
        model = document.querySelector('[data-v="codexModel"]')?.value || model
        if (!model) throw new Error('请先连接 Codex 并选择模型。')
        result = await api.creationVideoStart(p.id, {
          role: op === 'review-film' ? 'film-reviewer' : 'reviewer',
          exportId: element.dataset.id || '',
          model,
          shotId: s?.id,
          message:
            op === 'review-film'
              ? '独立复核此成片具体版本，报告镜头、时间、帧号与无法判断项。'
              : '审核本镜头的当前输入与全部生成风险。',
        })
      }
      if (op === 'save-key') {
        await api.creationVideoKey(get('provider').key)
        document.querySelector('[data-v="key"]').value = ''
        toast('凭证已加密保存。')
      }
      if (op === 'save-provider') {
        const cfg = get('provider')
        delete cfg.key
        result = await command({
          action: 'config',
          budget: cfg.budget,
          config: { ...cfg, audio: cfg.audio === 'true' },
        })
      }
      if (op === 'check-provider') {
        await api.creationVideoCheck(p.id)
        toast('火山方舟只读连接检查成功。')
      }
      if (op === 'prepare') submission = await api.creationVideoPrepare(p.id, s.id)
      if (op === 'submit') {
        result = await api.creationVideoSubmit(p.id, submission.token)
        submission = null
      }
      if (['poll', 'cancel-provider', 'attach-task', 'settle', 'resolve-unknown'].includes(op)) {
        result = await command({
          action: op,
          jobId: element.dataset.id,
          ...(['attach-task', 'settle'].includes(op) ? get(element.dataset.id) : {}),
        })
      }
      if (op === 'stop') result = await command({ action: 'stop' })
      if (op === 'save-edit')
        result = await command({
          action: 'save-edit',
          edit: {
            ...get('export'),
            clips: c.shots
              .map((s) => ({ shotId: s.id, ...get('clip-' + s.id) }))
              .filter((c) => c.artifactId),
          },
        })
      if (op === 'render') {
        await command({
          action: 'save-edit',
          edit: {
            ...get('export'),
            clips: c.shots
              .map((s) => ({ shotId: s.id, ...get('clip-' + s.id) }))
              .filter((x) => x.artifactId),
          },
        })
        result = await api.creationVideoRender(p.id)
      }
      if (op === 'tools') {
        const tools = await api.creationVideoTools(p.id)
        toast(tools.ffmpeg)
      }
      if (result) {
        state.workspace = result
        const form = {
          'save-brief': 'brief',
          'save-story': 'story',
          'confirm-story': 'story',
          'save-shot': 'shot',
          'save-design': 'design',
          'confirm-design': 'design',
          'save-frames': 'frames',
          'save-prompt': 'prompt',
          'save-provider': 'provider',
          'save-design-record': 'design-record-' + element.dataset.id,
        }[op]
        if (form) drafts.delete(draftKey(p, form))
        if (['save-edit', 'render'].includes(op))
          for (const key of drafts.keys())
            if (
              key.startsWith(p.id + ':form:') &&
              (key.includes(':clip-') || key.endsWith(':export'))
            )
              drafts.delete(key)
      }
      const updated = state.workspace.creationProjects.find((project) => project.id === p.id)
      if (updated?.video) {
        snapshot = { ...(await api.creationVideoState(p.id)), projectId: p.id }
        onState(updated, snapshot)
      }
    } catch (err) {
      lastError = true
      toast(err.message, 'error')
    } finally {
      busy = false
      render()
      const focus =
        document.querySelector(`[data-action="cs-v-${CSS.escape(op)}"]`) ||
        (op === 'delete-shot' ? document.querySelector('[data-action="cs-v-add-shot"]') : null)
      focus?.focus({ preventScroll: true })
    }
    return true
  }
  return { renderPage, hydrate, handle, getStep, setStep, selectShot, hasError: () => lastError }
}
