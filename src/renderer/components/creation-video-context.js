// Read saved production content beside the editor without opening another tool.
export function renderCreationVideoContext(p, shot, step, e, preview, shotOnly = false) {
  const content = p.video.content
  const shots = shotOnly && shot ? [shot] : content.shots
  const brief = content.brief
  const summary = p.brief || brief.idea || p.goal
  const metadata = [
    ['受众', brief.audience],
    ['发布', brief.platform],
    ['时长', brief.duration ? `${brief.duration} 秒` : ''],
    ['画幅', brief.ratio],
    ['风格', brief.style || content.style],
  ].filter(([, value]) => value)
  const mediaIds = [shot?.video, shot?.firstFrame, shot?.lastFrame, p.selectedArtifactId]
  const media = [...new Set(mediaIds)]
    .map((id) => p.artifacts.find((a) => a.id === id && ['image', 'video'].includes(a.type)))
    .filter(Boolean)
  if (!media.length)
    media.push(...p.artifacts.filter((a) => ['image', 'video'].includes(a.type)).slice(-2))
  return `<aside class="cv-content" aria-label="制作内容" data-cs-key="content:${e(p.id)}">
    <section class="cv-content-section"><h4>创作要求</h4><p class="cv-content-text">${e(summary || '尚未填写创作要求')}</p>${metadata.length ? `<dl class="cv-content-meta">${metadata.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>` : ''}</section>
    ${step !== 'story' && content.story ? `<section class="cv-content-section"><h4>已保存故事</h4><p class="cv-content-text cv-content-story">${e(content.story)}</p></section>` : ''}
    <section class="cv-content-section"><h4>${shotOnly ? '当前镜头' : '分镜内容'} <span>${shots.length} 个镜头</span></h4><ol class="cv-content-shots">${
      shots
        .map((s) => {
          const number = String(content.shots.indexOf(s) + 1).padStart(2, '0')
          const start = Number(s.start) || 0
          const duration = Number(s.duration) || 0
          const details = [s.framing, s.camera, s.movement].filter(Boolean)
          return `<li data-cs-key="content-shot:${e(s.id)}"><div class="cv-content-shot-heading"><button type="button" data-action="cs-v-inspect-shot" data-id="${e(s.id)}" aria-label="查看镜头 ${number} · ${e(s.purpose || '未命名镜头')}"><span>${number}</span>${e(s.purpose || '未填写叙事目的')}</button><span>${start}–${start + duration} 秒</span></div><p class="cv-content-text">${e(s.story || '尚未填写镜头内容')}</p>${details.length ? `<p class="cv-content-note">${e(details.join(' · '))}</p>` : ''}</li>`
        })
        .join('') || '<li class="cv-content-note">尚无分镜</li>'
    }</ol></section>
    <section class="cv-content-section"><h4>画面与版本 <span>${p.artifacts.length} 个作品版本</span></h4>${
      media.length
        ? `<div class="cv-content-media">${media
            .slice(0, 2)
            .map((a) => preview(p, a, 'content-' + a.id))
            .join('')}</div>`
        : '<p class="cv-content-note">尚未登记图片或视频版本</p>'
    }</section>
  </aside>`
}
