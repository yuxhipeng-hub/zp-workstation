const { PERIODS, repoName } = require('./github-discovery-schema.cjs')

function registerGitHubDiscoveryIpc({ ipcMain, client, workspace }) {
  ipcMain.handle('github:snapshot', (_event, options = {}) => {
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      Object.keys(options).some((key) => !['period', 'force', 'cacheOnly'].includes(key)) ||
      (options['period'] !== undefined && !PERIODS.has(options['period'])) ||
      ['force', 'cacheOnly'].some(
        (key) => options[key] !== undefined && typeof options[key] !== 'boolean',
      )
    )
      throw new Error('榜单参数无效。')
    return client.getSnapshot(options)
  })
  ipcMain.handle('github:favorites', () => workspace.get().githubFavorites)
  ipcMain.handle('github:favorite-set', (_event, input) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !['fullName', 'saved'].includes(key)) ||
      !repoName(input.fullName) ||
      typeof input.saved !== 'boolean'
    )
      throw new Error('收藏参数无效。')
    const existing = workspace
      .get()
      .githubFavorites.find((item) => item.fullName.toLowerCase() === input.fullName.toLowerCase())
    const repo = existing || client.findRepo(input.fullName)
    if (!repo && input.saved) throw new Error('请先加载包含这个项目的榜单。')
    return workspace.setGitHubFavorite(input.fullName, input.saved ? repo : null)
  })
}

module.exports = { registerGitHubDiscoveryIpc }
