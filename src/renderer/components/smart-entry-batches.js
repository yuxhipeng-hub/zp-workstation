import { assignmentTitleKey, assignmentCourseKey } from '../lib/assignment-duplicates.js'

// 只调度白名单 API；图片和草稿仅保留在本次录入的内存中。
export function createSmartEntrySession(
  { text = '', images = [], noticeDate = '' },
  request,
  notify,
) {
  let sequence = 0
  let cancelled = false
  let running = false
  const jobs = []
  const canonicalDrafts = new Map()
  const makeJob = (text, images) => ({
    id: String(++sequence),
    text,
    images,
    status: 'pending',
    error: '',
    drafts: [],
    label: images.length ? `截图 ${images.map((image) => image.number).join('、')}` : '通知文字',
  })
  if (text.trim()) jobs.push(makeJob(text, []))
  for (let index = 0; index < images.length; index += 4) {
    jobs.push(
      makeJob(
        '',
        images
          .slice(index, index + 4)
          .map((image, offset) => ({ ...image, number: index + offset + 1 })),
      ),
    )
  }

  function snapshot() {
    const drafts = []
    const seen = new Set()
    for (const job of jobs) {
      if (job.status !== 'done') continue
      for (const draft of job.drafts) {
        // 仅合并字段完全相同的结果；补充要求不同的条目保留，供用户核对。
        if (seen.has(draft)) continue
        seen.add(draft)
        drafts.push(draft)
      }
    }
    const done = jobs.filter((job) => job.status === 'done')
    return {
      jobs,
      drafts,
      running,
      doneImages: done.reduce((count, job) => count + job.images.length, 0),
      totalImages: images.length,
      doneBatches: done.length,
      complete: jobs.length > 0 && done.length === jobs.length,
    }
  }

  function split(job) {
    if (job.images.length > 1) {
      const middle = Math.ceil(job.images.length / 2)
      return [makeJob('', job.images.slice(0, middle)), makeJob('', job.images.slice(middle))]
    }
    if (!job.images.length && job.text.length > 500) {
      const middle = Math.floor(job.text.length / 2)
      const breaks = [...job.text.matchAll(/\n+/g)]
        .map((match) => match.index)
        .filter((index) => index > 0 && index < job.text.length - 1)
      const boundary = breaks.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0]
      if (boundary !== undefined)
        return [
          makeJob(job.text.slice(0, boundary), []),
          makeJob(job.text.slice(boundary).trim(), []),
        ]
    }
    return null
  }

  async function run(retryId = '') {
    if (running || cancelled) return
    if (retryId) {
      const job = jobs.find((item) => item.id === retryId)
      if (!job || !['failed', 'incomplete'].includes(job.status)) return
      job.status = 'pending'
    }
    running = true
    notify(snapshot())
    try {
      for (let index = 0; index < jobs.length && !cancelled; index += 1) {
        const job = jobs[index]
        if (job.status !== 'pending') continue
        job.status = 'running'
        job.error = ''
        notify(snapshot())
        try {
          const result = await request({
            text: job.text,
            images: job.images.map(({ name, dataUrl }) => ({ name, dataUrl })),
            noticeDate,
          })
          if (cancelled) return
          if (result.incomplete) {
            const children = split(job)
            if (children) {
              jobs.splice(index, 1, ...children)
              index -= 1
            } else {
              job.status = 'incomplete'
              job.error = job.images.length
                ? '这张截图可能未完整识别。请裁剪为较小范围后替换重试，或提高模型输出额度后重试。'
                : '文字可能未完整识别。请按通知段落拆开录入，或提高模型输出额度后重试。'
            }
          } else {
            job.drafts = (result.assignments || []).map((draft) => {
              const number = draft.sourceImage
                ? job.images[draft.sourceImage - 1]?.number
                : undefined
              const cleaned = {
                ...draft,
                sourceImage: number,
                sourceImages: number ? [number] : [],
                selected: true,
              }
              const key = JSON.stringify([
                assignmentTitleKey(draft.title),
                assignmentCourseKey(draft.course),
                draft.dueAt,
                draft.priority,
                draft.notes,
              ])
              const existing = canonicalDrafts.get(key)
              if (existing) {
                existing.sourceImages = [
                  ...new Set([...existing.sourceImages, ...cleaned.sourceImages]),
                ]
                return existing
              }
              canonicalDrafts.set(key, cleaned)
              return cleaned
            })
            job.status = 'done'
          }
        } catch (error) {
          if (cancelled) return
          job.status = 'failed'
          job.error = String(error.message || error).replace(
            /^Error invoking remote method '[^']+': (?:Error: )?/,
            '',
          )
        }
        if (!cancelled) notify(snapshot())
      }
    } finally {
      running = false
      if (!cancelled) notify(snapshot())
    }
  }

  return {
    run,
    snapshot,
    cancel() {
      cancelled = true
    },
    discardDrafts(handled) {
      for (const job of jobs) job.drafts = job.drafts.filter((draft) => !handled.has(draft))
      for (const [key, draft] of canonicalDrafts)
        if (handled.has(draft)) canonicalDrafts.delete(key)
    },
    replaceImage(id, image) {
      const job = jobs.find((item) => item.id === id)
      if (
        running ||
        !job ||
        job.images.length !== 1 ||
        !['failed', 'incomplete'].includes(job.status)
      )
        return false
      job.images[0] = { ...image, number: job.images[0].number }
      return true
    },
  }
}
