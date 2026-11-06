const PERIODS = new Set(['daily', 'weekly', 'monthly'])
const SOURCES = {
  gitstock: { name: 'GitStock', url: 'https://gitstock.org/docs/trending' },
  archive: { name: 'github-hot-hub 开源归档', url: 'https://github.com/SnailDev/github-hot-hub' },
}

function repoName(value) {
  if (typeof value !== 'string' || value.length > 150) return ''
  return /^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(value) &&
    !['.', '..'].includes(value.split('/')[1])
    ? value
    : ''
}

function count(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const text = typeof value === 'string' ? value.replace(/,/g, '').trim() : value
  if (typeof text === 'string' && !/^\d+$/.test(text)) return null
  if (text === null || text === undefined) return null
  const n = Number(text)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

function cleanRepo(input) {
  if (!input || typeof input !== 'object') return null
  const fullName = repoName(input.fullName)
  if (!fullName) return null
  return {
    fullName,
    url: `https://github.com/${fullName}`,
    description:
      typeof input.description === 'string' ? input.description.trim().slice(0, 1500) : '',
    language: typeof input.language === 'string' ? input.language.trim().slice(0, 60) : '',
    stars: count(input.stars),
    forks: count(input.forks),
    periodStars: count(input.periodStars),
    rank: count(input.rank),
  }
}

function cleanFavorites(input) {
  const seen = new Set()
  return (Array.isArray(input) ? input : []).slice(0, 500).flatMap((entry) => {
    const repo = cleanRepo(entry)
    if (
      !repo ||
      seen.has(repo.fullName.toLowerCase()) ||
      !Number.isFinite(Date.parse(entry.savedAt))
    )
      return []
    seen.add(repo.fullName.toLowerCase())
    return [{ ...repo, savedAt: new Date(entry.savedAt).toISOString() }]
  })
}

module.exports = { PERIODS, SOURCES, repoName, count, cleanRepo, cleanFavorites }
