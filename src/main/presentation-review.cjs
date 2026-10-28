const { presentationChatMessages, parsePresentationChat } = require('./presentation-chat.cjs')

function presentationReviewMessages(input, deck) {
  const messages = presentationChatMessages({ ...input, deck, selectedSlideId: null })
  messages[0].content += `\n本轮只做内容复核。对照原始材料、对话和当前作品逐页检查：
1. 是否把收到反馈写成已按反馈修改、把计划写成已完成、把课程成果写成获奖、把预估收益写成实际收益。
2. 图表数字、合计、单位、来源是否与材料对应；不能为填补证据缺口编造结论。
3. 用户明确要求是否覆盖，陈述时长是否一致。若页面已有 seconds，保留它；不要在 notes 再写不同的用时数字。
4. 主标题是否简明，正文与要点是否重复；只改必要内容。不能为了听起来更专业增加业务承诺或经历。
没有问题时输出 {"action":"accept","message":"未发现与已提交材料明显不一致的内容"}。
有问题时输出 action=edit 和按真实页面 id 的 changes.slides 局部补丁，沿用上面的编辑格式，不更换整套作品。没有证据就删除断言或改为【待补充】/建议，不编造替代事实。所有页面的主题与顺序保持，禁止 clarify/create。此检查只比较材料一致性，不声称完成现实世界事实核验。`
  messages[messages.length - 1].content =
    `原始输入与待复核作品（JSON 数据）：\n${JSON.stringify({ phase: 'review', message: input.message, deck, selectedSlideId: null })}`
  return messages
}
function parsePresentationReview(content, input, deck) {
  let parsed
  try {
    parsed = JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    )
  } catch {
    throw new Error('模型内容复核不是完整的 JSON。')
  }
  if (parsed?.action === 'accept') {
    if (
      typeof parsed.message !== 'string' ||
      !parsed.message.trim() ||
      parsed.message.length > 4000
    )
      throw new Error('模型内容复核说明无效。')
    return { deck, message: parsed.message }
  }
  if (parsed?.action !== 'edit' || parsed.changes?.replacementSlides)
    throw new Error('模型内容复核操作无效。')
  return parsePresentationChat(JSON.stringify(parsed), { ...input, deck, selectedSlideId: null })
}
module.exports = { presentationReviewMessages, parsePresentationReview }
