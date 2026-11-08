// Keep saved references specific to the current production step.
export function renderCreationVideoContext(p, shot, step, e, preview, shotOnly = false) {
  const content = p.video.content
  const shots = (shotOnly || ['audit', 'generate'].includes(step)) && shot ? [shot] : content.shots
  const brief = content.brief
  const summary = p.brief || brief.idea || p.goal
  const metadata = [
    ['受众', brief.audience],
    ['发布', brief.platform],
    ['时长', brief.duration ? `${brief.duration} 秒` : ''],
    ['画幅', brief.ratio],
    ['风格', brief.style || content.style],
  ].filter(([, value]) => value)
  const mediaIds =
    step === 'design'
      ? [...content.references, ...content.designs.flatMap((d) => d.references)]
      : step === 'edit'
        ? [
            ...p.video.edit.clips.map((c) => c.artifactId),
            ...p.video.exports.map((r) => r.artifactId),
          ]
        : step === 'generate'
          ? [shot?.video, shot?.firstFrame, shot?.lastFrame]
          : [shot?.firstFrame, shot?.lastFrame]
  const media = [...new Set(mediaIds)]
    .map((id) => p.artifacts.find((a) => a.id === id && ['image', 'video'].includes(a.type)))
    .filter(Boolean)
  const text = (label, value) =>
    `<section class="cv-content-section"><h4>${label}</h4><p class="cv-content-text">${e(value || '尚未填写')}</p></section>`
  const prompt = () =>
    `<section class="cv-content-section"><h4>已保存提示词</h4>${
      Object.entries(shot?.prompt || {})
        .filter(([, value]) => value)
        .map(
          ([key, value]) =>
            `<p class="cv-content-text"><strong>${e({ style: '画风', camera: '镜头', composition: '构图与配色', characters: '人物', action: '分段动作与时间', sound: '声音', constraints: '约束' }[key] || key)}</strong> ${e(value)}</p>`,
        )
        .join('') || '<p class="cv-content-note">尚未保存提示词</p>'
    }</section>`
  return `<aside class="cv-content" aria-label="制作内容" data-cs-key="content:${e(p.id)}">
    ${step === 'brief' ? `<section class="cv-content-section"><h4>创作要求</h4><p class="cv-content-text">${e(summary || '尚未填写创作要求')}</p>${metadata.length ? `<dl class="cv-content-meta">${metadata.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>` : ''}</section>` : ''}
    ${step === 'story' ? text('已保存故事', content.story) : ''}
    ${['design', 'audit'].includes(step) ? ['style', 'characters', 'scenes', 'props', 'colors'].map((key) => (content[key] ? text({ style: '画风', characters: '角色设定', scenes: '场景设定', props: '道具设定', colors: '色表' }[key], content[key]) : '')).join('') : ''}
    ${
      ['shots', 'audit', 'generate'].includes(step)
        ? `<section class="cv-content-section"><h4>${shotOnly || step !== 'shots' ? '当前镜头' : '分镜内容'} <span>${shots.length} 个镜头</span></h4><ol class="cv-content-shots">${
            shots
              .map((s) => {
                const number = String(content.shots.indexOf(s) + 1).padStart(2, '0')
                const start = Number(s.start) || 0
                const duration = Number(s.duration) || 0
                const details = [s.framing, s.camera, s.movement].filter(Boolean)
                return `<li data-cs-key="content-shot:${e(s.id)}"><div class="cv-content-shot-heading"><strong>${number} · ${e(s.purpose || '未填写叙事目的')}</strong><span>${start}–${start + duration} 秒</span></div><p class="cv-content-text">${e(s.story || '尚未填写镜头内容')}</p>${details.length ? `<p class="cv-content-note">${e(details.join(' · '))}</p>` : ''}</li>`
              })
              .join('') || '<li class="cv-content-note">尚无分镜</li>'
          }</ol></section>`
        : ''
    }
    ${['audit', 'generate'].includes(step) ? prompt() : ''}
    ${
      ['design', 'audit', 'generate', 'edit'].includes(step)
        ? `<section class="cv-content-section"><h4>${{ design: '设定参考图', audit: '待审核首尾帧', generate: '当前镜头画面', edit: '剪辑与成片版本' }[step]} <span>${media.length} 个作品版本</span></h4>${
            media.length
              ? `<div class="cv-content-media">${media
                  .slice(0, 2)
                  .map((a) => preview(p, a, 'content-' + a.id))
                  .join('')}</div>`
              : '<p class="cv-content-note">尚未关联对应版本</p>'
          }</section>`
        : ''
    }
  </aside>`
}
