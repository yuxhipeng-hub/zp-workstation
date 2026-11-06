/**
 * AI 资讯页（资讯 → AI 资讯）。
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
    <article class="news-item ${open ? 'is-open' : ''} ${story ? 'is-story' : ''}">
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
      return empty('正在读取资讯', 'loader')
    }
    if (state.newsError && !state.newsItems.length) {
      return empty(state.newsError, 'cloud-off')
    }
    if (!state.newsItems.length) {
      return empty('暂无匹配资讯，可调整筛选或关键词。', 'search-x')
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
      return empty('正在读取热点', 'loader')
    }
    if (state.newsHotError && !state.newsHot) {
      return empty(state.newsHotError, 'cloud-off')
    }
    const topics = state.newsHot || []
    if (!topics.length) {
      return empty('暂无热点事件', 'list-ordered')
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
        ? empty('正在读取日报', 'loader')
        : empty(state.aihotError || '暂无日报，可稍后刷新。', 'cloud-off')
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

  function empty(message, icon) {
    return `<div class="news-empty"><i data-lucide="${icon}" aria-hidden="true"></i><p>${escapeHtml(message)}</p></div>`
  }

  function busy() {
    return state.newsTab === 'selected'
      ? state.newsBusy
      : state.newsTab === 'hot'
        ? state.newsHotBusy
        : state.aihotBusy
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
                `<button class="news-chip ${state.newsCategory === id ? 'active' : ''}" type="button" data-news-category="${id}" aria-pressed="${state.newsCategory === id}">${label}</button>`,
            ).join('')}
          </div>
            <div class="news-periods" role="group" aria-label="时间范围">
              <button type="button" data-news-window="24h" aria-pressed="${state.newsWindow === '24h'}">24 小时</button>
              <button type="button" data-news-window="7d" aria-pressed="${state.newsWindow === '7d'}">7 天</button>
            </div>
        </div>`
        : ''
    const list =
      state.newsTab === 'hot'
        ? renderNewsHotList()
        : state.newsTab === 'daily'
          ? renderNewsDaily()
          : renderNewsList()
    const count =
      state.newsTab === 'selected'
        ? state.newsItems.length
        : state.newsTab === 'hot'
          ? (state.newsHot || []).length
          : (state.aihotDaily?.sections || []).reduce(
              (sum, section) => sum + section.items.length,
              0,
            )
    const error =
      state.newsTab === 'selected'
        ? state.newsError
        : state.newsTab === 'hot'
          ? state.newsHotError
          : state.aihotError
    return `<div class="ai-news">
    <header class="news-header" data-news-slot="header">
      <div class="news-tabs" role="group" aria-label="资讯视图">${tabs}</div>
      <div class="news-header-actions">
        ${state.newsTab === 'selected' ? `<div class="news-search"><input id="newsSearch" type="search" value="${escapeHtml(state.newsQuery)}" placeholder="搜索资讯" aria-label="搜索资讯" /><button type="button" data-action="search-news" aria-label="搜索" title="搜索"><i data-lucide="search" aria-hidden="true"></i></button></div>` : ''}
        <button class="news-refresh" type="button" data-action="refresh-news" aria-label="刷新资讯" aria-busy="${busy()}" ${busy() ? 'disabled' : ''}>
          <i data-lucide="refresh-cw" aria-hidden="true"></i><span>刷新</span>
        </button>
      </div>
    </header>
    <section class="news-feed">
      <div data-news-slot="filters">${toolbar}</div>
      <div class="news-status" data-news-slot="status"><span>${count} 条${state.newsTab === 'daily' && state.aihotDaily?.date ? ` · ${escapeHtml(state.aihotDaily.date)}` : ''}</span><span class="news-source"><button type="button" data-url="https://aihot.news">AIHOT</button>${busy() ? '<span role="status">更新中</span>' : error && count ? `<span role="status" title="${escapeHtml(error)}">更新失败</span>` : ''}</span></div>
      <div class="news-feed-list" data-news-slot="list" aria-busy="${busy()}">${list}</div>
    </section>
    </div>
  `
  }

  function update() {
    const root = document.querySelector('#view .ai-news')
    if (!root) return false
    const view = document.querySelector('#view'),
      top = view.scrollTop
    const active = document.activeElement
    const button = active?.closest('button, input')
    const attrs = [
      'id',
      'data-news-tab',
      'data-news-category',
      'data-news-window',
      'data-action',
      'data-id',
    ]
    const focus =
      button && root.contains(button)
        ? attrs
            .filter((attr) => button.hasAttribute(attr))
            .map((attr) => `[${attr}="${CSS.escape(button.getAttribute(attr))}"]`)
            .join('')
        : ''
    const search = root.querySelector('#newsSearch')
    const draft = search && search.value !== state.newsQuery ? search.value : null
    const selection = active === search ? [search.selectionStart, search.selectionEnd] : null
    const list = root.querySelector('.news-feed-list'),
      height = list.getBoundingClientRect().height
    const floor = Math.max(320, view.clientHeight + top - (view.scrollHeight - height))
    const reserved = busy() ? Math.max(floor, height) : floor
    const template = document.createElement('template')
    template.innerHTML = renderPage()
    for (const slot of ['header', 'filters', 'status', 'list']) {
      const current = root.querySelector(`[data-news-slot="${slot}"]`)
      const next = template.content.querySelector(`[data-news-slot="${slot}"]`)
      current.innerHTML = next.innerHTML
      if (slot === 'list') {
        current.style.minHeight = `${Math.ceil(reserved)}px`
        current.setAttribute('aria-busy', String(busy()))
      }
    }
    // Tabs can remove the filter row; reserve against the new toolbar height too.
    const chromeHeight = view.scrollHeight - list.getBoundingClientRect().height
    list.style.minHeight = `${Math.ceil(Math.max(reserved, view.clientHeight + top - chromeHeight))}px`
    const nextSearch = root.querySelector('#newsSearch')
    if (draft !== null && nextSearch) nextSearch.value = draft
    if (focus) root.querySelector(focus)?.focus({ preventScroll: true })
    if (selection && nextSearch) nextSearch.setSelectionRange(...selection)
    view.scrollTop = top
    return true
  }

  return { renderPage, update, isExpanded: newsExpanded }
}
