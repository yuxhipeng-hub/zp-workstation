import { cleanPresentation } from '../../shared/presentation.mjs'
import { materializeDesign } from '../../shared/presentation-design.mjs'

const exampleChart = (title, categories, values, unit, type = 'bar') => ({
  layout: 'chart',
  eyebrow: '03 / 数据页',
  title,
  chart: { type, categories, series: [{ name: title, values }], unit, source: '工作室示例数据' },
})

function example(id, label, prompt, theme, pages, direction) {
  const deck = cleanPresentation({
    id: `studio-example-${id}`,
    title: pages[0].title,
    scene: id === 'pitch' ? 'competition' : id,
    theme,
    slides: pages,
  })
  return { label, prompt, deck: direction ? materializeDesign(deck, direction) : deck }
}

export const PPT_HOME_EXAMPLES = {
  proposal: example(
    'proposal',
    '客户提案',
    '我想做一份客户提案。请先和我确认客户需求、方案价值与展示目标，再根据我补充的真实材料制作。',
    'editorial',
    [
      {
        layout: 'cover',
        eyebrow: '客户提案 / 零售服务',
        title: '门店服务试点',
        body: '先从一家门店开始，验证更快的响应与更稳的交付。',
      },
      {
        layout: 'process',
        eyebrow: '02 / 方案页',
        title: '四周试点，分三步落地',
        items: [
          { label: '第 1 周', title: '摸清现状', body: '梳理需求和服务基线' },
          { label: '第 2–3 周', title: '试运行', body: '在单店验证流程和分工' },
          { label: '第 4 周', title: '复盘扩展', body: '用数据决定下一步' },
        ],
      },
      exampleChart('首次响应时长', ['当前基线', '试点目标'], [30, 15], '分钟'),
    ],
    'precision',
  ),
  report: example(
    'report',
    '工作汇报',
    '我想做一份工作汇报。请根据我接下来提供的进展、数据和问题，帮我组织重点与下一步计划。',
    'midnight',
    [
      {
        layout: 'cover',
        eyebrow: '工作汇报 / 项目复盘',
        title: '把交付节奏拉齐',
        body: '本月进展、剩余风险和下月的三个重点。',
      },
      {
        layout: 'split',
        eyebrow: '02 / 进展页',
        title: '从分散跟进到统一交付',
        body: '每周用同一张进度表对齐依赖和风险。',
        points: ['需求统一进入待办池', '按周核对交付和阻塞', '跨组依赖明确负责人'],
      },
      exampleChart(
        '每周完成量',
        ['第 1 周', '第 2 周', '第 3 周', '第 4 周'],
        [6, 8, 9, 12],
        '项',
        'line',
      ),
    ],
  ),
  pitch: example(
    'pitch',
    '比赛路演',
    '我想做一份比赛路演 PPT。请先确认比赛要求、项目情况与展示时长，再根据真实材料策划。',
    'paper',
    [
      {
        layout: 'cover',
        eyebrow: '比赛路演 / 产品构想',
        title: '让闲置重新流通',
        body: '为校园闲置物品搭建一个可信的交换空间。',
      },
      {
        layout: 'split',
        eyebrow: '02 / 产品页',
        title: '让交换少一点不确定',
        body: '从发布、匹配到线下交接，三步完成一次交换。',
        points: ['校园身份核验', '按需求推荐物品', '约定交接点和时间'],
      },
      exampleChart('试点交换量', ['第 1 周', '第 2 周', '第 3 周'], [12, 19, 27], '次'),
    ],
    'story',
  ),
}
