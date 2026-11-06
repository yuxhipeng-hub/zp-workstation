const periods = { daily: '日榜', weekly: '周榜', monthly: '月榜' }
const growthLabels = { daily: '今日新增', weekly: '本周新增', monthly: '本月新增' }
const number = (value) =>
  value === null || value === undefined ? '暂无' : new Intl.NumberFormat('zh-CN').format(value)
const stamp = (value) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未读取'

export function createGitHubDiscoveryPage({ state, api, escapeHtml: e, render, toast }) {
  const results = new Map()
  const loading = new Set()
  const errors = new Map()
  const saving = new Set()
  let period = 'weekly',
    mode = 'trending',
    language = '',
    query = '',
    draft = '',
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
    const searchActive = active?.id === 'githubSearch'
    const start = searchActive ? /** @type {HTMLInputElement} */ (active).selectionStart : null
    const end = searchActive ? /** @type {HTMLInputElement} */ (active).selectionEnd : null
    const restore =
      focus ||
      (searchActive
        ? '#githubSearch'
        : active?.getAttribute('data-gh-row')
          ? focusSelector('data-gh-row', active.getAttribute('data-gh-row'))
          : active?.getAttribute('data-gh-favorite')
            ? focusSelector('data-gh-favorite', active.getAttribute('data-gh-favorite'))
            : active?.closest('.github-discovery') && active.id
              ? `#${CSS.escape(active.id)}`
              : active?.getAttribute('data-action')?.startsWith('gh-')
                ? `${focusSelector('data-action', active.getAttribute('data-action'))}${active.getAttribute('data-id') ? focusSelector('data-id', active.getAttribute('data-id')) : ''}`
                : '')
    render()
    if (restore) {
      const next = document.querySelector(restore)
      next?.focus({ preventScroll: true })
      if (searchActive && !focus) next?.setSelectionRange(start, end)
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
          <span class="gh-rank">${mode === 'favorites' ? '<i data-lucide="bookmark"></i>' : String(item.rank || '—').padStart(2, '0')}</span>
          <span class="gh-project-copy"><strong>${e(item.fullName)}</strong><span class="gh-description">${e(item.description || '项目暂未提供介绍。')}</span><span class="gh-meta">${e(item.language || '语言未标注')}<span>·</span>Star ${number(item.stars)}<span>·</span>Fork ${number(item.forks)}</span></span>
          ${mode === 'trending' ? `<span class="gh-growth"><strong>${item.periodStars === null ? '暂无' : `+${number(item.periodStars)}`}</strong><small>${growthLabels[period]} Star</small></span>` : ''}
          <i data-lucide="chevron-${open ? 'up' : 'down'}" class="gh-chevron"></i>
        </button>
        <button type="button" class="gh-save" data-action="gh-favorite" data-id="${e(item.fullName)}" data-gh-favorite="${e(item.fullName)}" aria-pressed="${isSaved}" aria-label="${isSaved ? '取消收藏' : '收藏'} ${e(item.fullName)}" title="${isSaved ? '取消收藏' : '收藏项目'}" ${saving.has(item.fullName) ? 'disabled' : ''}><i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}"></i></button>
      </div>
      ${
        open
          ? `<div class="gh-detail"><h3>项目介绍</h3><p>${e(item.description || '项目暂未提供介绍，可以打开 GitHub 查看说明。')}</p>
        <p class="gh-detail-note">${mode === 'favorites' ? `收藏于 ${stamp(item.savedAt)}；指标为收藏时的快照。` : '热度与排名来自来源快照，项目详情以仓库说明为准。'}</p>
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
    const filtered = all.filter(
      (item) =>
        (!language || item.language === language) &&
        (!query ||
          `${item.fullName} ${item.description} ${item.language}`
            .toLocaleLowerCase('zh-CN')
            .includes(query.toLocaleLowerCase('zh-CN'))),
    )
    const busy = loading.has(period)
    const error = mode === 'trending' ? errors.get(period) : null
    const cached = result?.fromCache
    let content = filtered.map(row).join('')
    if (!all.length && mode === 'trending' && busy)
      content = `<div class="gh-loading" role="status"><i data-lucide="loader-circle"></i>正在读取${periods[period]}…</div>`
    else if (!filtered.length)
      content = `<div class="gh-empty"><i data-lucide="${error ? 'cloud-off' : mode === 'favorites' && !all.length ? 'bookmark' : 'search'}"></i><h3>${error && !all.length && mode === 'trending' ? '暂时连接不上榜单' : !all.length && mode === 'favorites' ? '把值得研究的项目留在这里' : '没有匹配的项目'}</h3><p>${e(error && !all.length && mode === 'trending' ? error : !all.length && mode === 'favorites' ? '在榜单中点击书签即可收藏，离线也能查看。' : '试试其他关键词，或清除语言筛选。')}</p>${query || language ? '<button type="button" class="button secondary" data-action="gh-clear">清除筛选</button>' : ''}</div>`
    return `<div class="github-discovery">
      <section class="page-intro action-intro gh-intro"><div><h2>GitHub 发现</h2><p>看看最近哪些开源项目受到关注，留下值得研究的那几个。</p></div>${mode === 'trending' ? `<button type="button" class="button secondary" data-action="gh-refresh" ${busy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i>${busy ? '正在检查' : '刷新榜单'}</button>` : ''}</section>
      ${mode === 'trending' ? `<div class="gh-snapshot-summary" role="status"><span>${result ? `${e(result.source.name)} · 采集于 ${stamp(result.snapshot.capturedAt)}` : '等待首次连接，成功读取后会保留本地快照。'}</span><strong>${busy ? '正在检查更新' : result?.stale ? '待更新 · 已保留快照' : cached ? '本地缓存' : result ? '来源快照' : '尚无数据'}</strong>${error || result?.warning ? `<p>${e(error || result.warning)}</p>` : ''}</div>` : ''}
      <section class="gh-feed" aria-label="GitHub 项目榜单">
        <div class="gh-navigation"><div class="gh-modes" role="group" aria-label="项目视图"><button type="button" data-action="gh-mode" data-id="trending" aria-pressed="${mode === 'trending'}">趋势榜</button><button type="button" data-action="gh-mode" data-id="favorites" aria-pressed="${mode === 'favorites'}">我的收藏 <span>${favorites().length}</span></button></div>
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
        </div>
        <div class="gh-toolbar"><form data-gh-search class="gh-search"><label class="sr-only" for="githubSearch">搜索${mode === 'favorites' ? '收藏' : '当前榜单'}</label><i data-lucide="search" aria-hidden="true"></i><input id="githubSearch" type="search" maxlength="150" placeholder="搜索项目名称或介绍" value="${e(draft)}"><button class="button secondary compact" type="submit">搜索</button></form><label class="gh-language">${mode === 'favorites' ? '收藏语言' : '榜内语言'}<select id="githubLanguage" aria-label="${mode === 'favorites' ? '收藏语言' : '榜内语言'}"><option value="">全部语言</option>${languages.map((lang) => `<option value="${e(lang)}" ${lang === language ? 'selected' : ''}>${e(lang)}</option>`).join('')}</select></label></div>
        <div class="gh-list-heading"><span>${mode === 'favorites' ? '已收藏项目' : `趋势${periods[period]}`} <strong>${filtered.length}</strong>${filtered.length !== all.length ? ` / ${all.length}` : ''}</span><span>${mode === 'favorites' ? '仅保存在本地工作区' : '沿用来源排名 · 筛选当前榜单'}</span></div>
        <div class="gh-list" aria-busy="${busy && mode === 'trending'}">${content}</div>
      </section>
      ${
        mode === 'trending'
          ? `<footer class="gh-source"><div role="status"><span class="gh-status-dot"></span><strong>${busy ? '正在检查更新' : result?.stale ? '已保存榜单 · 待更新' : cached ? '已保存榜单' : result ? '已获取榜单' : '等待连接'}</strong>${result ? `<span>来源：<button type="button" class="text-button" data-url="${e(result.source.url)}">${e(result.source.name)}</button></span>` : ''}</div>
        ${result ? `<p>来源采集：<time datetime="${e(result.snapshot.capturedAt)}">${stamp(result.snapshot.capturedAt)}</time><span>上次成功检查：${stamp(result.checkedAt)}</span></p>` : ''}
        ${error || result?.warning ? `<p class="gh-source-warning">${e(error || result.warning)}</p>` : ''}
        <p>榜单为来源快照；刷新不会强制上游重新采集。打开 GitHub 原站仍取决于当前网络。</p>
        <details><summary>数据来源与更新说明</summary><p>优先读取 GitStock 公开接口（请求中文描述，未翻译时保留原文）；不可用或数据较早时尝试 github-hot-hub 开源归档。应用每 30 分钟按需检查，失败保留本地数据。采集超过 6 小时会提示待更新，主备来源可能存在采集差异。收藏保留当时的项目介绍与指标，随工作区备份。</p></details>
      </footer>`
          : ''
      }
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
      query = ''
      draft = ''
      repaint('#githubSearch')
    }
    return true
  }

  function handleInput(target) {
    if (target.id !== 'githubSearch') return false
    draft = target.value.slice(0, 150)
    return true
  }
  function handleChange(target) {
    if (target.id !== 'githubLanguage') return false
    language = target.value
    repaint('#githubLanguage')
    return true
  }
  function handleSubmit(event) {
    if (!event.target.matches('[data-gh-search]')) return false
    event.preventDefault()
    query = draft.trim()
    repaint('#githubSearch')
    return true
  }
  return { renderPage, open, handleAction, handleInput, handleChange, handleSubmit }
}
