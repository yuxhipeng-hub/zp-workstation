/** Balance long titles at punctuation or word boundaries. Keep saved text untouched. */
export function balancedTitle(node) {
  const text = node.text
  if (!text || text.includes('\n')) return text
  const chars = [...text]
  const units = [0]
  for (const c of chars) units.push(units.at(-1) + (c.charCodeAt(0) > 255 ? 1 : 0.56))
  // Leave room for differences in font metrics between the preview and Office readers.
  const capacity = (node.w * 0.94) / node.size
  const count = Math.ceil(units.at(-1) / capacity)
  if (count < 2 || count > Math.floor(node.h / (node.size * 1.35))) return text
  const target = units.at(-1) / count
  const memo = new Map()
  const solve = (start, left) => {
    if (!left) return start === chars.length ? { score: 0, cuts: [] } : null
    const key = `${start}:${left}`
    if (memo.has(key)) return memo.get(key)
    let best = null
    for (let end = start + 1; end <= chars.length; end++) {
      const width = units[end] - units[start]
      if (width > capacity) break
      if (end < chars.length) {
        if (/[，、。！？：；）】》]/u.test(chars[end]) || /[（【《]/u.test(chars[end - 1])) continue
        if (/[a-z0-9]/i.test(chars[end - 1]) && /[a-z0-9]/i.test(chars[end])) continue
      }
      const rest = solve(end, left - 1)
      if (!rest) continue
      const boundary = /[：；]/u.test(chars[end - 1])
        ? -4
        : /[，、\s]/u.test(chars[end - 1])
          ? -1
          : 0
      const score = (width - target) ** 2 + boundary + rest.score
      if (!best || score < best.score) best = { score, cuts: [end, ...rest.cuts] }
    }
    memo.set(key, best)
    return best
  }
  const result = solve(0, count)
  if (!result) return text
  let start = 0
  return result.cuts
    .map((end) => {
      const line = chars.slice(start, end).join('')
      start = end
      return line
    })
    .join('\n')
}
