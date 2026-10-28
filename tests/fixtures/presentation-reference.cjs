const { createPresentation } = require('../../src/shared/presentation.mjs')

function referenceDeck(id, legacy = false) {
  const deck = createPresentation({
    title: id === 'competition' ? '向智能制造工艺工程师迈进' : '用四周试点验证报表自动化',
    scene: id === 'competition' ? 'competition' : 'proposal',
  })
  const slide = (layout, title, fields = {}) => ({
    layout,
    title,
    eyebrow: '评测样本 · 合成材料',
    body: '',
    points: [],
    notes: '',
    ...fields,
  })
  const chart = (categories, values, source, unit) => ({
    type: 'bar',
    categories,
    series: [{ name: '现状', values }],
    source,
    unit,
  })
  const comparison = {
    headers: id === 'competition' ? ['当前基础', '目标要求'] : ['维持人工', '轻量自动化'],
    rows:
      id === 'competition'
        ? [
            { label: '工艺分析', values: ['机械课程基础', '真实产线分析经验'] },
            { label: '数据分析', values: ['Python 入门', '独立分析作品'] },
            { label: '沟通协作', values: ['课程小组合作', '跨角色现场协作'] },
          ]
        : [
            { label: '前期投入', values: ['成本低', '需梳理数据字段'] },
            { label: '日常操作', values: ['重复劳动较多', '减少重复操作待验证'] },
            { label: '追溯方式', values: ['依赖个人', '统一留痕'] },
          ],
  }
  deck.slides =
    id === 'competition'
      ? [
          slide('cover', deck.title, { body: '机械专业大二 · 成长赛道模拟陈述' }),
          slide('statement', '用机械基础连接数据分析', {
            body: '目标：智能制造工艺工程师。以课程设计和实践反馈验证方向。',
          }),
          slide('comparison', '把能力差距转成下一步任务', {
            body: '已有基础与目标要求逐项对照。',
            comparison,
          }),
          slide('process', '已有行动形成初步学习闭环', {
            items: [
              { label: '01', title: '学习基础课程', body: '完成机械制图与 Python 基础' },
              { label: '02', title: '完成课程设计', body: '形成一份装配图' },
              { label: '03', title: '吸收反馈', body: '获得教师反馈，尚无竞赛奖项' },
            ],
          }),
          slide('chart', '陈述重点落在学习实践行动', {
            body: '以下为模拟比赛评分权重，不是个人能力评分。',
            chart: chart(
              ['职业目标', '学习实践行动', '优化改进'],
              [30, 50, 20],
              '模拟比赛通知（评测样本）',
              '分',
            ),
          }),
          slide('timeline', '把成长计划安排到具体阶段', {
            body: '以下均为计划，尚未完成。',
            items: [
              { label: '本学期', title: '补充知识', body: '统计与工艺知识' },
              { label: '下学期', title: '形成作品', body: '公开数据分析项目' },
              { label: '暑期', title: '申请实习', body: '争取制造企业实践机会' },
            ],
          }),
          slide('split', '每月用反馈校正一次方向', {
            body: '依据学习实践结果调整职业方向与行动路径。',
            points: ['复盘已经完成的行动', '记录不足与改进任务', '个人成果证据待补充'],
          }),
          slide('closing', '让每一次实践都有证据可回看', {
            body: '下一步：补齐课程设计与教师反馈材料。',
          }),
        ]
      : [
          slide('cover', deck.title, { body: '面向运营负责人的决策提案 · 尚未签约' }),
          slide('metrics', '先验证问题，再承诺收益', {
            items: [
              { value: '8 小时', title: '每周整理报表', body: '来自合成访谈记录' },
              { value: '4 周', title: '建议试点周期', body: '属于计划，尚未实施' },
              { value: '待确认', title: '收益与报价', body: '不预先承诺节省比例' },
            ],
            source: '合成商业材料（评测样本）',
          }),
          slide('chart', '清洗数据占用一半整理时间', {
            body: '每周合计 8 小时，先从清洗与校验切入。',
            chart: chart(
              ['数据采集', '数据清洗', '报表排版'],
              [3, 4, 1],
              '合成访谈记录（评测样本）',
              '小时 / 周',
            ),
          }),
          slide('comparison', '用可控试点验证自动化方案', { comparison }),
          slide('process', '从统一口径走向可追溯交付', {
            items: [
              { label: '01', title: '梳理字段', body: '业务方确认口径' },
              { label: '02', title: '导入与校验', body: '输出异常清单' },
              { label: '03', title: '并行核对', body: '保留人工结果比对' },
              { label: '04', title: '复盘决策', body: '依据证据决定是否扩展' },
            ],
          }),
          slide('timeline', '四周计划设立清晰检查点', {
            body: '尚未实施的建议计划。',
            items: [
              { label: '第 1 周', title: '确认口径', body: '确定字段与负责人' },
              { label: '第 2 周', title: '开发样例', body: '完成试点样例' },
              { label: '第 3 周', title: '并行验证', body: '记录准确性与异常' },
              { label: '第 4 周', title: '复盘验收', body: '检查耗时变化' },
            ],
          }),
          slide('split', '把风险放进试点验收清单', {
            body: '准确性、异常追溯与耗时变化的阈值待双方确认。',
            points: ['格式变化：设立版本规则', '数据缺失：输出异常清单', '口径不一：由客户确认'],
          }),
          slide('closing', '先安排需求访谈，确认试点负责人', {
            body: '下一步：确认范围、验收口径与商业条件。',
          }),
        ]
  if (legacy)
    deck.slides = deck.slides.map((s) => {
      if (['cover', 'statement', 'split', 'steps', 'closing'].includes(s.layout)) return s
      const points = s.items
        ? s.items.map((item) =>
            [item.label || item.value, item.title, item.body].filter(Boolean).join(' · '),
          )
        : s.comparison
          ? s.comparison.rows.map((row) => `${row.label}：${row.values.join(' / ')}`)
          : s.chart.categories.map(
              (category, i) => `${category}：${s.chart.series[0].values[i]} ${s.chart.unit}`,
            )
      return slide('split', s.title, {
        body: s.body,
        points,
        notes: s.chart?.source || s.source || '',
      })
    })
  return deck
}

function planningReply(deck) {
  return {
    action: 'plan',
    plan: {
      title: deck.title,
      scene: deck.scene,
      theme: deck.theme,
      audience: deck.audience,
      goal: deck.goal,
      strategy: {
        thesis: '以事实支持核心判断，以行动形成下一步。',
        requirements: ['区分事实与计划'],
        missing: ['缺少的证据明确标记待补充'],
      },
      pages: deck.slides.map((slide) => ({
        title: slide.title,
        layout: slide.layout,
        purpose: '用已知材料支持本页结论并推进主线',
      })),
    },
  }
}
module.exports = { referenceDeck, planningReply }
