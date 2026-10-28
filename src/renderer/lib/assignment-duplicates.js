/**
 * 作业重复匹配。
 *
 * 只比较本地已有字段，不访问网络，也不改动作业对象。匹配规则刻意保守：
 * 标题相同、截止日期相同（或至少一方缺失）、课程相同（或至少一方缺失）才算可能重复。
 * 截止日期不同的同名作业视为不同周次的重复任务，不拦截。
 */

/**
 * @typedef {object} AssignmentLike
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [course]
 * @property {string} [dueAt]
 * @property {string} [notes]
 * @property {string} [priority]
 * @property {number} [batchIndex]
 * @property {string} [sourceQuote]
 * @property {string} [previousDueAt]
 */

/**
 * @typedef {object} DuplicateMatch
 * @property {'reschedule'} [kind]
 * @property {number} [batchIndex]
 * @property {AssignmentLike} assignment
 * @property {'high' | 'medium'} confidence
 */

const TITLE_SEPARATORS = /[\s\u3000_\-—–.·、,，。:：;；!！?？'"“”‘’（）()【】《》<>/\\|]+/g
const UNCLASSIFIED_COURSES = new Set(['未分类', '未分类作业', 'uncategorized'])

/**
 * 把标题压成可比较的键：统一全半角、大小写，去掉空白和标点。
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function assignmentTitleKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(TITLE_SEPARATORS, '')
}

/**
 * 课程名的比较键；“未分类”和空课程都视为未知，不参与冲突判断。
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function assignmentCourseKey(value) {
  const key = String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(TITLE_SEPARATORS, '')
    .replace(/(实验|实训|实践|课程|课)+$/g, '')
  return UNCLASSIFIED_COURSES.has(key) ? '' : key
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function dueDateKey(value) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

/**
 * 在已有作业里找与草稿最接近的一条。
 *
 * 高置信：标题和截止日期相同；课程相同或一方未知。
 * 中置信：标题相同、课程相同或未知，但截止日期至少一方缺失。
 * 同名但截止日期不同、或课程冲突的作业不返回，避免把每周重复的任务误合并。
 *
 * @param {AssignmentLike | null | undefined} draft
 * @param {AssignmentLike[] | null | undefined} assignments
 * @returns {DuplicateMatch | null}
 */
export function findDuplicateAssignment(draft, assignments) {
  const title = assignmentTitleKey(draft?.title)
  if (!title) return null
  const due = dueDateKey(draft?.dueAt)
  const course = assignmentCourseKey(draft?.course)
  /** @type {DuplicateMatch[]} */
  const matches = []

  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    if (!assignment || assignmentTitleKey(assignment.title) !== title) continue
    const otherDue = dueDateKey(assignment.dueAt)
    if (due && otherDue && due !== otherDue) continue
    const otherCourse = assignmentCourseKey(assignment.course)
    if (course && otherCourse && course !== otherCourse) continue
    matches.push({
      assignment,
      confidence: due && otherDue && due === otherDue ? 'high' : 'medium',
    })
  }

  // 作业列表按新到旧排列，同置信度时保留更近添加的那条。
  return matches.find((match) => match.confidence === 'high') || matches[0] || null
}

/**
 * 仅提示有明确更正/延期依据且能唯一定位的日期变更，不自动覆盖。
 * @param {AssignmentLike} draft
 * @param {AssignmentLike[]} assignments
 * @returns {DuplicateMatch | null}
 */
export function findAssignmentChange(draft, assignments) {
  const evidence = `${draft.notes || ''}\n${draft.sourceQuote || ''}`
  if (!/(?:延期|延后|延至|提前|更正|改期|截止.{0,12}(?:调整|更改|改为))/.test(evidence)) return null
  const title = assignmentTitleKey(draft.title)
  const course = assignmentCourseKey(draft.course)
  const due = dueDateKey(draft.dueAt)
  const previous = dueDateKey(draft.previousDueAt)
  if (!title || !due) return null
  const candidates = assignments.filter((item) => {
    const oldDue = dueDateKey(item.dueAt)
    const otherCourse = assignmentCourseKey(item.course)
    return (
      assignmentTitleKey(item.title) === title &&
      oldDue &&
      oldDue !== due &&
      (!previous || previous === oldDue) &&
      (!course || !otherCourse || course === otherCourse)
    )
  })
  return candidates.length === 1
    ? { assignment: candidates[0], confidence: 'medium', kind: 'reschedule' }
    : null
}

/**
 * 生成“合并到已有作业”时的补丁：只补已有作业为空的字段，不覆盖原有内容。
 * @param {AssignmentLike | null | undefined} existing
 * @param {AssignmentLike | null | undefined} draft
 * @returns {{ course?: string, dueAt?: string, notes?: string }}
 */
export function buildAssignmentMergePatch(existing, draft) {
  /** @type {{ course?: string, dueAt?: string, notes?: string }} */
  const patch = {}
  const existingCourse = String(existing?.course ?? '').trim()
  const draftCourse = String(draft?.course ?? '').trim()
  if (!existingCourse && draftCourse) patch.course = draftCourse
  if (!String(existing?.dueAt ?? '').trim() && String(draft?.dueAt ?? '').trim()) {
    patch.dueAt = String(draft?.dueAt).trim()
  }
  if (!String(existing?.notes ?? '').trim() && String(draft?.notes ?? '').trim()) {
    patch.notes = String(draft?.notes).trim()
  }
  return patch
}

/** 仅在用户明确选择“更新截止日期”后使用。
 * @param {AssignmentLike} existing
 * @param {AssignmentLike} draft
 */
export function buildAssignmentDeadlinePatch(existing, draft) {
  const dueAt = dueDateKey(draft.dueAt)
  if (!dueAt) throw new Error('新的截止日期无效，请重新核对。')
  const oldNotes = String(existing.notes || '')
    .replace(/^截止时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}\s*$/gm, '')
    .trim()
  const newNotes = String(draft.notes || '').trim()
  const notes = [oldNotes, oldNotes.includes(newNotes) ? '' : newNotes].filter(Boolean).join('\n')
  if (notes.length > 2000) throw new Error('更新后的备注超过 2000 字，请缩短备注后重试。')
  return { ...buildAssignmentMergePatch(existing, draft), dueAt, notes }
}

/** 仅同步应用生成的截止说明，不改写用户的其他备注。
 * @param {string} notes
 * @param {string} dueAt
 */
export function syncAssignmentDeadlineNotes(notes, dueAt) {
  const date = dueDateKey(dueAt)
  return notes.replace(
    /^截止(?:时间：\d{4}-\d{2}-\d{2} |时刻：)(\d{2}:\d{2})(?:（日期待确认）)?$/gm,
    (_line, time) => (date ? `截止时间：${date} ${time}` : `截止时刻：${time}（日期待确认）`),
  )
}
