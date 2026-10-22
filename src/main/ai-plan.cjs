function cleanText(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function cleanList(value, maxItems = 12, maxLength = 500) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function cleanAiPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const steps = cleanList(input.steps)
  if (!steps.length) return null
  return {
    generatedAt: cleanText(input.generatedAt, 40),
    provider: cleanText(input.provider, 100),
    model: cleanText(input.model, 160),
    summary: cleanText(input.summary, 1200),
    prerequisites: cleanList(input.prerequisites),
    steps,
    risks: cleanList(input.risks),
    checklist: cleanList(input.checklist),
  }
}

module.exports = { cleanAiPlan }
