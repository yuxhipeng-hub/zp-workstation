const path = require('node:path')
const { validatePresentationInput, getPresentationIssues } = require('../shared/presentation.mjs')
const { cleanPresentationBrief } = require('./presentation-ai.cjs')
const { cleanPresentationChat } = require('./presentation-chat.cjs')
const { exportPresentation } = require('./presentation-export.cjs')
const { readPresentationImage } = require('./presentation-image.cjs')

/** PPT 白名单独立注册，进程、对话框与保存依赖均由主进程注入。 */
function registerPresentationIpc({
  ipcMain,
  workspace,
  aiService,
  dialog,
  getMainWindow,
  getExportDirectory,
  onPresentationDirty,
  writePresentation = exportPresentation,
}) {
  ipcMain.handle('presentation:dirty', (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('作品状态无效。')
    onPresentationDirty?.(value)
    return true
  })
  ipcMain.handle('presentation:save', (_event, input) =>
    workspace.savePresentation(validatePresentationInput(input)),
  )
  ipcMain.handle('presentation:delete', (_event, id) => {
    if (typeof id !== 'string' || !id || id.length > 80) throw new Error('作品编号无效。')
    return workspace.deletePresentation(id)
  })
  ipcMain.handle('presentation:generate', (_event, input) =>
    aiService.generatePresentation(cleanPresentationBrief(input)),
  )
  ipcMain.handle('presentation:chat', (_event, input) =>
    aiService.chatPresentation(cleanPresentationChat(input)),
  )
  let imageBusy = false
  ipcMain.handle('presentation:image', async () => {
    if (imageBusy) throw new Error('已有图片正在导入。')
    imageBusy = true
    try {
      const result = await dialog.showOpenDialog(getMainWindow(), {
        title: '选择 PPT 图片',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }],
      })
      if (result.canceled || !result.filePaths?.[0]) return { canceled: true }
      return await readPresentationImage(result.filePaths[0], (bytes) =>
        require('electron').nativeImage.createFromBuffer(bytes),
      )
    } finally {
      imageBusy = false
    }
  })
  let exportBusy = false
  ipcMain.handle('presentation:export', async (_event, input) => {
    const deck = validatePresentationInput(input)
    if (getPresentationIssues(deck).some((issue) => issue.blocking))
      throw new Error('部分页面内容超出版式容量，请根据交付检查调整后导出。')
    if (exportBusy) throw new Error('已有作品正在导出，请稍候。')
    exportBusy = true
    try {
      const name =
        deck.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || '演示文稿'
      const result = await dialog.showSaveDialog(getMainWindow(), {
        title: '导出可编辑 PPTX',
        defaultPath: path.join(getExportDirectory(), `${name}.pptx`),
        filters: [{ name: 'PowerPoint 演示文稿', extensions: ['pptx'] }],
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      const target = /\.pptx$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pptx`
      return await writePresentation(deck, target)
    } finally {
      exportBusy = false
    }
  })
}

module.exports = { registerPresentationIpc }
