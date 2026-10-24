/**
 * AI 资讯页（学习 → AI 资讯）。
 *
 * 渲染层拆分阶段二第 4 页。只迁列表、热点、日报和条目详情；筛选、加载、
 * 复制等动作与共享状态仍由 `main.js` 处理。
 */

export function createNewsPage({ state, escapeHtml, formatTime, findNewsItem }) {
  const NEWS_CATEGORIES = [
    ['', '全部'],
    ['ai-models', '模型'],
    ['ai-products', '产品'],
    ['industry', '行业'],
    ['paper', '论文'],
    ['tip', '教程'],
    ['opinion', '观点'],
  ]

  const NEWS_TABS = [
    ['selected', '精选'],
    ['hot', '热点'],
    ['daily', '日报'],
  ]

  function newsCategoryLabel(slug) {
    const match = NEWS_CATEGORIES.find(([id]) => id && id === slug)
    return match ? match[1] : '资讯'
  }

  function newsItemMeta(item) {
    return [
      item.source?.name,
      formatTime(item.publishedAt || item.discoveredAt),
      item.category ? newsCategoryLabel(item.category) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  function newsExpanded(kind, id) {
    return state.newsExpanded.kind === kind && state.newsExpanded.id === id
  }

  function renderNewsRelated(item) {
    const others = (state.newsItems || []).filter((entry) => entry.id !== item.id)
    const sameCategory = others.filter(
      (entry) => entry.category && item.category && entry.category === item.category,
    )
    const related = (sameCategory.length ? sameCategory : others).slice(0, 3)
    if (!related.length) return ''
    return `
    <div class="news-related">
      <h4>${sameCategory.length ? '同类条目' : '其他条目'}</h4>
      ${related
        .map(
          (entry) => `
          <button class="news-related-row" type="button" data-action="toggle-news-item" data-id="${escapeHtml(entry.id || '')}">
            <span>${escapeHtml(entry.title)}</span>
            <small>${escapeHtml(newsItemMeta(entry))}</small>
          </button>`,
        )
        .join('')}
    </div>`
  }

  function renderNewsItemBody(item) {
    if (!item) return ''
    return `
    <div class="news-body">
      <p class="news-summary">${escapeHtml(item.summary || '这一条还没有摘要。')}</p>
      ${
        item.originalTitle
          ? `<p class="news-original">原文标题：${escapeHtml(item.originalTitle)}</p>`
          : ''
      }
      ${
        item.reason
          ? `<div class="news-reason"><span>入选理由</span><p>${escapeHtml(item.reason)}</p></div>`
          : ''
      }
      <div class="news-actions">
        <button class="button secondary compact" type="button" data-action="copy-news-item" data-id="${escapeHtml(item.id || '')}">
          <i data-lucide="copy"></i><span>复制摘要</span>
        </button>
        ${
          item.links?.original
            ? `<button class="button secondary compact" type="button" data-url="${escapeHtml(item.links.original)}"><i data-lucide="external-link"></i><span>打开原文</span></button>`
            : ''
        }
        ${
          item.links?.aihot
            ? `<button class="text-button" type="button" data-url="${escapeHtml(item.links.aihot)}">AIHOT 阅读页 <i data-lucide="chevron-right"></i></button>`
            : ''
        }
      </div>
      ${renderNewsRelated(item)}
    </div>`
  }

  function renderNewsStoryBody() {
    if (state.newsStoryBusy && !state.newsStory) {
      return '<div class="news-body"><p class="news-note">正在读取事件综述…</p></div>'
    }
    if (state.newsStoryError && !state.newsStory) {
      return `<div class="news-body"><p class="news-note">暂时取不到事件详情：${escapeHtml(state.newsStoryError)}</p></div>`
    }
    const story = state.newsStory
    if (!story) return ''
    const digest = String(story.digest || '')
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    const reports = story.reports || []
    const visibleReports = state.newsTimelineExpanded ? reports.slice(0, 20) : reports.slice(0, 3)
    const hiddenCount = Math.max(0, Math.min(reports.length, 20) - visibleReports.length)
    return `
    <div class="news-body">
      ${digest.map((paragraph) => `<p class="news-summary">${escapeHtml(paragraph)}</p>`).join('')}
      ${
        reports.length
          ? `<div class="news-timeline">
        <h4>报道时间线</h4>
        ${visibleReports
          .map(
            (report) => `
            <div class="news-report">
              <span class="news-report-time">${escapeHtml(formatTime(report.publishedAt))}</span>
              <span class="news-report-copy">
                <strong>${escapeHtml(report.title)}</strong>
                ${report.summary ? `<small>${escapeHtml(report.summary)}</small>` : ''}
                <em>${escapeHtml(report.source?.name || '未知来源')}</em>
              </span>
            </div>`,
          )
          .join('')}
        ${
          hiddenCount > 0 || state.newsTimelineExpanded
            ? `<button class="text-button news-timeline-toggle" type="button" data-action="toggle-news-timeline">
                ${state.newsTimelineExpanded ? '收起时间线' : `展开其余 ${hiddenCount} 条报道`}
              </button>`
            : ''
        }
      </div>`
          : ''
      }
      ${
        story.links?.aihot
          ? `<div class="news-actions"><button class="text-button" type="button" data-url="${escapeHtml(story.links.aihot)}">AIHOT 事件页 <i data-lucide="chevron-right"></i></button></div>`
          : ''
      }
    </div>`
  }

  function renderNewsEntry({ id, title, meta, rank = 0, story = false }) {
    const kind = story ? 'story' : 'item'
    const open = newsExpanded(kind, id)
    return `
    <article class="news-item ${open ? 'is-open' : ''}">
      <button class="news-item-head" type="button" data-action="${story ? 'toggle-news-story' : 'toggle-news-item'}" data-id="${escapeHtml(id)}" aria-expanded="${open}">
        ${rank ? `<span class="news-rank">${rank}</span>` : ''}
        <span class="news-item-copy">
          <span class="news-item-title">${escapeHtml(title)}</span>
          <span class="news-item-meta">${escapeHtml(meta)}</span>
        </span>
        <i class="news-chevron" data-lucide="chevron-down"></i>
      </button>
      ${open ? (story ? renderNewsStoryBody() : renderNewsItemBody(findNewsItem(id))) : ''}
    </article>`
  }

  function renderNewsList() {
    if (state.newsBusy && !state.newsItems.length) {
      return '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取资讯</span></div>'
    }
    if (state.newsError && !state.newsItems.length) {
      return `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.newsError)}</span></div>`
    }
    if (!state.newsItems.length) {
      return '<div class="news-note"><i data-lucide="search-x"></i><span>没有匹配的资讯，换个关键词或分类试试。</span></div>'
    }
    return `
    ${state.newsItems
      .map((item) => renderNewsEntry({ id: item.id, title: item.title, meta: newsItemMeta(item) }))
      .join('')}
    ${
      state.newsHasMore
        ? `<button class="button secondary news-more" type="button" data-action="load-more-news" ${state.newsBusy ? 'disabled' : ''}>
            <i data-lucide="chevron-down"></i><span>${state.newsBusy ? '正在加载' : '加载更多'}</span>
          </button>`
        : ''
    }`
  }

  function renderNewsHotList() {
    if (state.newsHotBusy && !state.newsHot) {
      return '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取热点榜</span></div>'
    }
    if (state.newsHotError && !state.newsHot) {
      return `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.newsHotError)}</span></div>`
    }
    const topics = state.newsHot || []
    if (!topics.length) {
      return '<div class="news-note"><i data-lucide="flame"></i><span>最近 48 小时还没有形成多来源讨论的事件。</span></div>'
    }
    return topics
      .map((topic) =>
        renderNewsEntry({
          id: topic.publicId,
          title: topic.title,
          meta: [
            `${topic.sourceCount} 个来源`,
            topic.latestAt ? `最近 ${formatTime(topic.latestAt)}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          rank: topic.rank,
          story: true,
        }),
      )
      .join('')
  }

  function renderNewsDaily() {
    const daily = state.aihotDaily
    if (!daily) {
      return state.aihotBusy
        ? '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取日报</span></div>'
        : `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.aihotError || '暂时没有读到日报。')}</span></div>`
    }
    return `
    <div class="news-daily-lead">
      <strong>${escapeHtml(daily.lead?.title || '')}</strong>
      <span>${escapeHtml(daily.lead?.leadParagraph || '')}</span>
    </div>
    ${daily.sections
      .map(
        (section) => `
        <div class="news-section">
          <h4>${escapeHtml(section.label)}</h4>
          ${section.items
            .map((item) =>
              renderNewsEntry({ id: item.id, title: item.title, meta: newsItemMeta(item) }),
            )
            .join('')}
        </div>`,
      )
      .join('')}`
  }

  function renderPage() {
    const tabs = NEWS_TABS.map(
      ([id, label]) =>
        `<button type="button" data-news-tab="${id}" class="${state.newsTab === id ? 'active' : ''}" aria-pressed="${state.newsTab === id}">${label}</button>`,
    ).join('')
    const toolbar =
      state.newsTab === 'selected'
        ? `
        <div class="news-toolbar">
          <div class="news-chips" role="group" aria-label="资讯分类">
            ${NEWS_CATEGORIES.map(
              ([id, label]) =>
                `<button class="news-chip ${state.newsCategory === id ? 'active' : ''}" type="button" data-news-category="${id}">${label}</button>`,
            ).join('')}
          </div>
          <div class="news-filter-row">
            <div class="news-chips" role="group" aria-label="时间范围">
              <button class="news-chip ${state.newsWindow === '24h' ? 'active' : ''}" type="button" data-news-window="24h">24 小时</button>
              <button class="news-chip ${state.newsWindow === '7d' ? 'active' : ''}" type="button" data-news-window="7d">7 天</button>
            </div>
            <div class="news-search">
              <i data-lucide="search"></i>
              <input id="newsSearch" type="search" value="${escapeHtml(state.newsQuery)}" placeholder="搜索关键词，回车确认" aria-label="搜索资讯" />
              <button class="icon-button compact" type="button" data-action="search-news" title="搜索"><i data-lucide="arrow-right"></i></button>
            </div>
          </div>
        </div>`
        : ''
    const list =
      state.newsTab === 'hot'
        ? renderNewsHotList()
        : state.newsTab === 'daily'
          ? renderNewsDaily()
          : renderNewsList()
    return `
    <section class="page-intro action-intro">
      <div>
        <h2>AI 资讯</h2>
        <p>内容来自 AIHOT 的公开接口，摘要、入选理由和事件综述都在应用内阅读。</p>
      </div>
      <div class="button-row">
        <div class="news-tabs" role="tablist" aria-label="资讯视图">${tabs}</div>
        <button class="button secondary" type="button" data-action="refresh-news">
          <i data-lucide="refresh-cw"></i><span>刷新</span>
        </button>
      </div>
    </section>

    <section class="news-feed">
      ${toolbar}
      <div class="news-feed-list">${list}</div>
    </section>
  `
  }

  return { renderPage, isExpanded: newsExpanded }
}
