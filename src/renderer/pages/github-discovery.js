const periods = { daily: '日榜', weekly: '周榜', monthly: '月榜' }
const growthLabels = { daily: '今日新增', weekly: '本周新增', monthly: '本月新增' }
const number = (value) =>
  value === null || value === undefined ? '暂无' : new Intl.NumberFormat('zh-CN').format(value)
const stamp = (value) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : ''

export function createGitHubDiscoveryPage({
  state,
  api,
  escapeHtml: e,
  render,
  refreshIcons,
  toast,
  preview = false,
}) {
  const results = new Map()
  const loading = new Set()
  const errors = new Map()
  const saving = new Set()
  let period = 'weekly',
    mode = 'trending',
    language = '',
    expanded = ''
  const favorites = () => state.workspace?.githubFavorites || []
  const saved = (name) =>
    favorites().some((item) => item.fullName.toLowerCase() === name.toLowerCase())
  const items = () =>
    mode === 'favorites' ? favorites() : results.get(period)?.snapshot?.items || []
  const focusSelector = (attr, value) => `[${attr}="${CSS.escape(value)}"]`

  function repaint(focus = '') {
    if (state.page !== 'github') return
    const active = document.activeElement
    const restore =
      focus ||
      (active?.getAttribute('data-gh-row')
        ? focusSelector('data-gh-row', active.getAttribute('data-gh-row'))
        : active?.getAttribute('data-gh-favorite')
          ? focusSelector('data-gh-favorite', active.getAttribute('data-gh-favorite'))
          : active?.closest('.github-discovery') && active.id
            ? `#${CSS.escape(active.id)}`
            : active?.getAttribute('data-action')?.startsWith('gh-')
              ? `${focusSelector('data-action', active.getAttribute('data-action'))}${active.getAttribute('data-id') ? focusSelector('data-id', active.getAttribute('data-id')) : ''}`
              : '')
    const root = document.querySelector('#view .github-discovery')
    if (root) {
      const view = document.querySelector('#view')
      const top = view.scrollTop
      const oldList = root.querySelector('.gh-list')
      const listHeight = oldList.getBoundingClientRect().height
      const chromeHeight = view.scrollHeight - listHeight
      // Retain enough height for the current scroll position, including during loading.
      const floor = Math.max(320, view.clientHeight + top - chromeHeight)
      const reserved = loading.has(period) ? Math.max(floor, listHeight) : floor
      const template = document.createElement('template')
      template.innerHTML = renderPage()
      for (const slot of ['header', 'navigation', 'status', 'list']) {
        const current = root.querySelector(`[data-gh-slot="${slot}"]`)
        const next = template.content.querySelector(`[data-gh-slot="${slot}"]`)
        if (current.innerHTML !== next.innerHTML) current.innerHTML = next.innerHTML
        if (slot === 'list') {
          current.setAttribute('aria-busy', next.getAttribute('aria-busy'))
          current.style.minHeight = `${Math.ceil(reserved)}px`
        }
      }
      refreshIcons()
      view.scrollTop = top
    } else render()
    if (restore) {
      const next = document.querySelector(restore)
      next?.focus({ preventScroll: true })
    }
  }

  async function load(selected = period, force = false) {
    if (loading.has(selected)) return
    loading.add(selected)
    errors.delete(selected)
    repaint()
    try {
      if (!results.has(selected)) {
        const cached = await api.getGitHubSnapshot({ period: selected, cacheOnly: true })
        if (cached) {
          results.set(selected, cached)
          repaint()
        }
      }
      const result = await api.getGitHubSnapshot({ period: selected, force })
      if (result) results.set(selected, result)
    } catch (error) {
      errors.set(selected, error.message)
    } finally {
      loading.delete(selected)
      repaint()
    }
  }

  async function open() {
    repaint()
    if (mode === 'trending') await load()
  }

  function row(item) {
    const isSaved = saved(item.fullName)
    const open = expanded === item.fullName
    return `<article class="gh-item ${open ? 'is-open' : ''}">
      <div class="gh-item-top">
        <button type="button" class="gh-item-head" data-action="gh-expand" data-id="${e(item.fullName)}" data-gh-row="${e(item.fullName)}" aria-expanded="${open}">
          <span class="gh-rank">${mode === 'favorites' ? '<i data-lucide="bookmark"></i>' : item.rank ? String(item.rank).padStart(2, '0') : '—'}</span>
          <span class="gh-project-copy"><strong>${e(item.fullName)}</strong><span class="gh-description">${e(item.description || '项目暂未提供介绍。')}</span><span class="gh-meta">${e(item.language || '语言未标注')}<span>·</span>Star ${number(item.stars)}</span></span>
          ${mode === 'trending' ? `<span class="gh-growth"><strong>${item.periodStars === null ? '暂无' : `+${number(item.periodStars)}`}</strong><small>${growthLabels[period]} Star</small></span>` : ''}
          <i data-lucide="chevron-${open ? 'up' : 'down'}" class="gh-chevron"></i>
        </button>
        <button type="button" class="gh-save" data-action="gh-favorite" data-id="${e(item.fullName)}" data-gh-favorite="${e(item.fullName)}" aria-pressed="${isSaved}" aria-label="${isSaved ? '取消收藏' : '收藏'} ${e(item.fullName)}" title="${isSaved ? '取消收藏' : '收藏项目'}" ${saving.has(item.fullName) ? 'disabled' : ''}><i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}"></i></button>
      </div>
      ${
        open
          ? `<div class="gh-detail"><p>${e(item.description || '项目暂未提供介绍。')}</p>
        <div class="button-row"><button type="button" class="button secondary compact" data-url="${e(item.url)}"><i data-lucide="external-link"></i>打开 GitHub</button><button type="button" class="button secondary compact" data-action="gh-copy" data-id="${e(item.fullName)}"><i data-lucide="copy"></i>复制链接</button></div>
      </div>`
          : ''
      }
    </article>`
  }

  function renderPage() {
    const result = results.get(period)
    const all = items()
    const languages = [
      ...new Set([
        ...all.map((item) => item.language).filter(Boolean),
        ...(language ? [language] : []),
      ]),
    ].sort()
    const filtered = all.filter((item) => !language || item.language === language)
    const busy = loading.has(period)
    const error = mode === 'trending' ? errors.get(period) : null
    let content = filtered.map(row).join('')
    if (!all.length && mode === 'trending' && busy)
      content = `<div class="gh-loading" role="status"><i data-lucide="loader-circle"></i>正在读取${periods[period]}…</div>`
    else if (!filtered.length) {
      const title =
        mode === 'favorites' && !all.length
          ? '把值得研究的项目留在这里'
          : preview && !all.length
            ? '请在桌面应用中查看榜单'
            : error && !all.length
              ? '暂时连接不上榜单'
              : '没有匹配的项目'
      const note =
        mode === 'favorites' && !all.length
          ? '点击榜单中的书签即可收藏。'
          : language
            ? '试试其他语言。'
            : error && !preview
              ? '稍后刷新再试。'
              : ''
      content = `<div class="gh-empty"><i data-lucide="${mode === 'favorites' ? 'bookmark' : 'list-ordered'}"></i><h3>${title}</h3>${note ? `<p>${note}</p>` : ''}${language ? '<button type="button" class="button secondary" data-action="gh-clear">全部语言</button>' : ''}</div>`
    }
    const stateLabel = busy
      ? '更新中'
      : result?.warning?.includes('缓存未能写入')
        ? '未保存'
        : result?.stale
          ? '待更新'
          : ''
    return `<div class="github-discovery">
      <header class="gh-header" data-gh-slot="header"><h2>GitHub 发现</h2>${mode === 'trending' ? `<button type="button" class="button secondary" data-action="gh-refresh" aria-busy="${busy}" ${busy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i>刷新榜单</button>` : ''}</header>
      <section class="gh-feed" aria-label="GitHub 项目榜单">
        <div class="gh-navigation" data-gh-slot="navigation">
          <div class="gh-modes" role="group" aria-label="项目视图"><button type="button" data-action="gh-mode" data-id="trending" aria-pressed="${mode === 'trending'}">趋势榜</button><button type="button" data-action="gh-mode" data-id="favorites" aria-pressed="${mode === 'favorites'}">我的收藏 <span>${favorites().length}</span></button></div>
          ${
            mode === 'trending'
              ? `<div class="gh-periods" role="group" aria-label="榜单周期">${Object.entries(
                  periods,
                )
                  .map(
                    ([key, label]) =>
                      `<button type="button" data-action="gh-period" data-id="${key}" aria-pressed="${period === key}">${label}</button>`,
                  )
                  .join('')}</div>`
              : ''
          }
          <label class="gh-language"><span class="gh-sr-only">${mode === 'favorites' ? '收藏语言' : '榜内语言'}</span><select id="githubLanguage" aria-label="${mode === 'favorites' ? '收藏语言' : '榜内语言'}"><option value="">全部语言</option>${languages.map((lang) => `<option value="${e(lang)}" ${lang === language ? 'selected' : ''}>${e(lang)}</option>`).join('')}</select></label>
        </div>
        <div class="gh-snapshot-summary" data-gh-slot="status"><span>${mode === 'favorites' ? '已收藏' : periods[period]} · ${filtered.length} 项</span><span class="gh-source">${mode === 'trending' && result ? `<button type="button" class="text-button" data-url="${e(result.source.url)}">${e(result.source.name)}</button> · <time datetime="${e(result.snapshot.capturedAt)}">${stamp(result.snapshot.capturedAt)}</time>` : ''}</span><span class="gh-state" role="status" title="${e(result?.warning || '')}">${stateLabel}</span></div>
        <div class="gh-list" data-gh-slot="list" aria-busy="${busy && mode === 'trending'}">${content}</div>
      </section>
    </div>`
  }

  async function handleAction(action, element) {
    if (!action.startsWith('gh-')) return false
    const id = element.dataset.id || ''
    if (action === 'gh-period' && Object.hasOwn(periods, id)) {
      period = id
      expanded = ''
      language = ''
      repaint(`[data-action="gh-period"][data-id="${period}"]`)
      await load()
    } else if (action === 'gh-mode') {
      mode = id === 'favorites' ? 'favorites' : 'trending'
      language = ''
      expanded = ''
      repaint(`[data-action="gh-mode"][data-id="${mode}"]`)
      if (mode === 'trending' && !results.has(period)) await load()
    } else if (action === 'gh-refresh') {
      await load(period, true)
    } else if (action === 'gh-expand') {
      expanded = expanded === id ? '' : id
      repaint(focusSelector('data-gh-row', id))
    } else if (action === 'gh-favorite' && !saving.has(id)) {
      saving.add(id)
      repaint()
      try {
        state.workspace = await api.setGitHubFavorite({ fullName: id, saved: !saved(id) })
      } finally {
        saving.delete(id)
        repaint(focusSelector('data-gh-favorite', id))
      }
    } else if (action === 'gh-copy') {
      const item = items().find((entry) => entry.fullName === id)
      if (item) {
        await api.copyText(item.url)
        toast('项目链接已复制。', 'info')
      }
    } else if (action === 'gh-clear') {
      language = ''
      repaint('#githubLanguage')
    }
    return true
  }

  function handleChange(target) {
    if (target.id !== 'githubLanguage') return false
    language = target.value
    repaint('#githubLanguage')
    return true
  }
  return { renderPage, open, handleAction, handleChange }
}
