// 仅用于开发者主动执行的真实模型评测，不是单元测试，不保存或修改用户工作区。
const electronRuntime = require('electron')
const { app, safeStorage, BrowserWindow } = electronRuntime
const fs = require('node:fs/promises')
const syncFs = require('node:fs')
const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const process = require('node:process')
const console = require('node:console')
const { Buffer } = require('node:buffer')
const { URL } = require('node:url')
const { isDeepStrictEqual } = require('node:util')
const { SettingsStore } = require('../src/main/settings-store.cjs')
const { AiService } = require('../src/main/ai-service.cjs')
const {
  getPresentationIssues,
  buildSlideScene,
  validatePresentationInput,
} = require('../src/shared/presentation.mjs')
const { presentationBuffer } = require('../src/main/presentation-export.cjs')
const { canvasFromScene } = require('../src/shared/presentation-canvas.mjs')
const cases = require('../tests/fixtures/presentation-cases.cjs')
const { referenceDeck } = require('../tests/fixtures/presentation-reference.cjs')

// Node 父进程等待 Electron 完全退出后再清理，防止 Chromium 退出时重建 Local State。
if (typeof electronRuntime === 'string') {
  const isolated = syncFs.mkdtempSync(path.join(os.tmpdir(), 'zp-ppt-evaluation-'))
  const env = { ...process.env, ZP_PPT_EVALUATION_TEMP: isolated }
  delete env.ELECTRON_RUN_AS_NODE
  let code = 1
  try {
    const run = spawnSync(
      electronRuntime,
      [require.resolve('./evaluate-presentation.cjs'), ...process.argv.slice(2)],
      { env, stdio: 'inherit', windowsHide: true },
    )
    code = run.status ?? 1
  } finally {
    if (
      path.dirname(isolated) === path.resolve(os.tmpdir()) &&
      path.basename(isolated).startsWith('zp-ppt-evaluation-')
    )
      syncFs.rmSync(isolated, { recursive: true, force: true })
  }
  process.exit(code)
}

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

async function main() {
  const reference = process.argv.includes('--reference')
  const renderOnly = process.argv.includes('--render-existing')
  if (!reference && !renderOnly && !process.argv.includes('--configured-model'))
    throw new Error('需要 --reference 或显式传入 --configured-model。')
  const outputIndex = process.argv.indexOf('--output')
  if (outputIndex < 0 || !path.isAbsolute(process.argv[outputIndex + 1] || ''))
    throw new Error('请用 --output 指定绝对输出目录。')
  const output = process.argv[outputIndex + 1]
  const isolated = process.env.ZP_PPT_EVALUATION_TEMP
  if (
    !isolated ||
    path.dirname(isolated) !== path.resolve(os.tmpdir()) ||
    !path.basename(isolated).startsWith('zp-ppt-evaluation-')
  )
    throw new Error('请使用 node scripts/evaluate-presentation.cjs 启动评测。')
  const userData = path.join(app.getPath('appData'), 'deepseek-harness-launcher')
  app.setPath('userData', isolated)
  let window
  try {
    // OSCrypt 的密钥上下文随 Electron 配置目录隔离。只复制已有的加密密钥元数据到临时目录，
    // 解密仍由系统 safeStorage / AiSecretStore 完成；不写用户配置，不复制或输出明文凭据。
    if (!reference && !renderOnly) {
      try {
        const state = JSON.parse(syncFs.readFileSync(path.join(userData, 'Local State'), 'utf8'))
        if (state.os_crypt)
          syncFs.writeFileSync(
            path.join(isolated, 'Local State'),
            JSON.stringify({ os_crypt: state.os_crypt }),
          )
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error('无法建立独立的模型凭据上下文。')
      }
    }
    await app.whenReady()
    const service =
      reference || renderOnly
        ? null
        : new AiService({
            userDataDir: userData,
            settings: new SettingsStore(userData),
            safeStorage,
          })
    if (process.argv.includes('--model-status')) {
      const config = service.getConfig()
      console.log(
        JSON.stringify({
          profiles: config.profiles.map((p) => ({
            label: p.label,
            model: p.model,
            protocol: p.protocol,
            supportsVision: p.supportsVision,
            hasKey: p.hasKey,
            requiresKey: p.requiresKey,
            active: p.id === config.activeProfileId,
            officialDeepSeek: new URL(p.baseUrl).hostname === 'api.deepseek.com',
          })),
        }),
      )
      return
    }
    if (process.argv.includes('--vision-probe') || process.argv.includes('--connection-probe')) {
      const modelIndex = process.argv.indexOf('--model')
      const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : ''
      const configured = service.getConfig().profiles.find((p) => p.model === model)
      if (!configured) throw new Error('未找到指定模型 ID 的已保存配置。')
      const result = process.argv.includes('--connection-probe')
        ? { ...(await service.testProfile(configured.id)), model: configured.model }
        : await service.testVisionProfile(configured.id)
      await fs.mkdir(output, { recursive: true })
      await fs.writeFile(
        path.join(
          output,
          process.argv.includes('--connection-probe')
            ? 'connection-probe.json'
            : 'vision-probe.json',
        ),
        JSON.stringify(result, null, 2),
      )
      console.log(JSON.stringify(result))
      if (!(result.passed || result.ok)) process.exitCode = 1
      return
    }
    const profile = reference || renderOnly ? null : service.resolveProfile()
    if (!reference && !renderOnly && !profile) throw new Error('桌面应用尚未配置可用模型。')
    await fs.mkdir(output, { recursive: true })
    if (process.argv.includes('--visual-workflow') || process.argv.includes('--visual-existing')) {
      const originalRequest = service.requestChat.bind(service)
      let callIndex = 0
      service.requestChat = async (...args) => {
        const content = await originalRequest(...args)
        await fs.writeFile(path.join(output, `model-call-${++callIndex}.txt`), content)
        return content
      }
      const { PresentationQuality } = require('../src/main/presentation-quality.cjs')
      const { renderPresentationPages } = require('../src/main/presentation-render.cjs')
      const sample = cases.find((c) => c.id === 'proposal')
      const started = Date.now()
      let full, previews
      if (process.argv.includes('--visual-existing'))
        full = JSON.parse(await fs.readFile(path.join(output, 'before-visual.json'), 'utf8'))
      else {
        previews = await service.designPresentation({
          action: 'samples',
          message: sample.message,
          direction: 'precision',
        })
        await fs.writeFile(path.join(output, 'samples.json'), JSON.stringify(previews, null, 2))
        await fs.writeFile(
          path.join(output, 'samples.pptx'),
          await presentationBuffer(previews.deck),
        )
        full = await service.designPresentation({
          action: 'complete',
          message: sample.message,
          plan: previews.plan,
          direction: 'precision',
        })
        await fs.writeFile(path.join(output, 'before-visual.json'), JSON.stringify(full, null, 2))
      }
      const quality = new PresentationQuality({
        aiService: {
          getConfig: () => ({ visionProfileId: profile.id }),
          resolveProfile: () => ({ ...profile, supportsVision: true }),
          requestVision: service.requestVision.bind(service),
        },
        renderPages: async (deck, options) => {
          const pages = await renderPresentationPages(deck, options)
          const round = (quality.renderCount || 0) + 1
          quality.renderCount = round
          for (const page of pages)
            await fs.writeFile(
              path.join(output, `round-${round}-page-${page.page}.jpg`),
              Buffer.from(page.data.split(',')[1], 'base64'),
            )
          return pages
        },
      })
      const checked = await quality.inspect({ deck: full.deck })
      await fs.writeFile(path.join(output, 'visual-result.json'), JSON.stringify(checked, null, 2))
      await fs.writeFile(path.join(output, 'complete.pptx'), await presentationBuffer(checked.deck))
      console.log(
        JSON.stringify({
          elapsedMs: Date.now() - started,
          samples: previews?.deck.slides.length || 3,
          pages: checked.deck.slides.length,
          report: checked.report,
        }),
      )
      return
    }
    if (process.argv.includes('--object-edit')) {
      if (!service) throw new Error('对象修改评测需要 --configured-model。')
      const deck = validatePresentationInput(referenceDeck('proposal'))
      const slide = deck.slides[2]
      slide.canvas = canvasFromScene(
        buildSlideScene(slide, deck.theme, 2, deck.slides.length),
        slide,
      )
      const target = slide.canvas.find((node) => node.field === 'title')
      for (const node of slide.canvas) node.locked = node.id !== target.id
      const started = Date.now()
      const result = await service.chatPresentation({
        message:
          '只修改选中的标题对象：文字改为“用数据减少重复劳动”，字号改为44，水平位置向右移动24像素。其他对象、页面、备注保持不变。',
        deck,
        selectedSlideId: slide.id,
        selectedObjectId: target.id,
      })
      const updated = result.deck?.slides[2].canvas.find((node) => node.id === target.id)
      const checks = {
        title: updated?.text === '用数据减少重复劳动',
        size: updated?.size === 44,
        position: updated?.x === target.x + 24,
        otherPages: isDeepStrictEqual(
          result.deck?.slides.filter((s) => s.id !== slide.id),
          deck.slides.filter((s) => s.id !== slide.id),
        ),
        lockedObjects: isDeepStrictEqual(
          result.deck?.slides[2].canvas.filter((n) => n.locked),
          slide.canvas.filter((n) => n.locked),
        ),
      }
      const summary = { model: profile.model, elapsedMs: Date.now() - started, checks }
      await fs.writeFile(
        path.join(output, 'selected-object.json'),
        JSON.stringify({ summary, result }, null, 2),
      )
      if (result.deck)
        await fs.writeFile(
          path.join(output, 'selected-object.pptx'),
          await presentationBuffer(result.deck),
        )
      console.log(JSON.stringify(summary))
      if (!Object.values(checks).every(Boolean)) process.exitCode = 1
      return
    }
    const results = []
    let baseline
    if (process.argv.includes('--baseline')) {
      await fs.mkdir(path.join(isolated, 'main'), { recursive: true })
      await fs.mkdir(path.join(isolated, 'shared'), { recursive: true })
      for (const file of ['main/presentation-chat.cjs', 'shared/presentation.mjs']) {
        await fs.writeFile(
          path.join(isolated, file),
          execFileSync('git', ['show', `1df1017:src/${file}`], {
            cwd: path.dirname(require.resolve('../package.json')),
            windowsHide: true,
          }),
        )
      }
      baseline = require(path.join(isolated, 'main/presentation-chat.cjs'))
    }
    const caseIndex = process.argv.indexOf('--case')
    const selectedCases =
      caseIndex >= 0 ? cases.filter((sample) => sample.id === process.argv[caseIndex + 1]) : cases
    if (!selectedCases.length) throw new Error('没有匹配的评测样本。')
    const request = service?.requestChat.bind(service)
    for (const sample of selectedCases) {
      const started = Date.now()
      let responseIndex = 0
      if (service)
        service.requestChat = async (...args) => {
          const content = await request(...args)
          // 只记录本次合成材料对应的模型正文，不记录配置、请求头或凭据。
          await fs.writeFile(
            path.join(output, `${sample.id}-response-${++responseIndex}.txt`),
            content,
          )
          return content
        }
      console.log(`正在评测：${sample.id}`)
      try {
        const result = renderOnly
          ? JSON.parse(await fs.readFile(path.join(output, `${sample.id}.json`), 'utf8'))
          : reference
            ? {
                action: 'create',
                message: '人工编写的固定参考作品，用于排版与导出比较，不是模型生成质量评测。',
                deck: referenceDeck(sample.id, process.argv.includes('--legacy')),
              }
            : baseline
              ? baseline.parsePresentationChat(
                  await service.requestChat(
                    profile,
                    baseline.presentationChatMessages({ message: sample.message }),
                    { maxTokens: 10000, temperature: 0.5 },
                  ),
                  { message: sample.message },
                )
              : await service.chatPresentation({ message: sample.message })
        await fs.writeFile(path.join(output, `${sample.id}.json`), JSON.stringify(result, null, 2))
        const summary = {
          id: sample.id,
          model: reference
            ? '人工参考样本（非模型生成）'
            : renderOnly
              ? '已有作品重新渲染'
              : profile.model,
          action: result.action,
          elapsedMs: Date.now() - started,
          manualChecks: sample.checks,
        }
        if (result.deck) {
          const deck = result.deck
          summary.pages = deck.slides.length
          summary.layouts = [...new Set(deck.slides.map((slide) => slide.layout))]
          summary.issues = getPresentationIssues(deck)
          try {
            await fs.writeFile(
              path.join(output, `${sample.id}.pptx`),
              await presentationBuffer(deck),
            )
          } catch (error) {
            summary.exportError = error.message
          }
          const slides = deck.slides
            .map((slide, i) => {
              const scene = buildSlideScene(slide, deck.theme, i, deck.slides.length)
              const nodes = scene.nodes.flatMap((node) => node.preview || [node])
              return `<section style="background:#${scene.background}">${nodes
                .map((node) => {
                  const style = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;`
                  if (node.type === 'line')
                    return `<svg style="${style}" viewBox="0 0 ${Math.max(1, node.w)} ${Math.max(1, node.h)}"><line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}" stroke="#${node.color}" stroke-width="${node.stroke || 2}"/></svg>`
                  return node.type === 'rect' || node.type === 'ellipse'
                    ? `<span style="${style}background:#${node.color};${node.type === 'ellipse' ? 'border-radius:50%;' : ''}"></span>`
                    : `<span style="${style}color:#${node.color};font-family:'${node.font}';font-size:${node.size}px;font-weight:${node.bold ? 700 : 400}">${escape(node.text)}</span>`
                })
                .join('')}</section>`
            })
            .join('')
          const html = `<!doctype html><meta charset="UTF-8"><title>评测样本</title><style>*{box-sizing:border-box}body{margin:0;background:#333}::-webkit-scrollbar{display:none}section{position:relative;width:1280px;height:720px;overflow:hidden}section>span,section>svg{position:absolute;display:block;white-space:pre-wrap;line-height:1.35;overflow-wrap:anywhere}</style>${slides}`
          const file = path.join(output, `${sample.id}.html`)
          await fs.writeFile(file, html)
          window ||= new BrowserWindow({
            show: false,
            width: 1280,
            height: 720,
            useContentSize: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
          })
          await window.loadFile(file)
          for (let i = 0; i < deck.slides.length; i++) {
            await window.webContents.executeJavaScript(
              `window.scrollTo(0, ${i * 720}); document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`,
            )
            await fs.writeFile(
              path.join(output, `${sample.id}-${String(i + 1).padStart(2, '0')}.png`),
              (await window.webContents.capturePage()).toPNG(),
            )
          }
        }
        results.push(summary)
        console.log(
          `完成：${sample.id}，${summary.pages || 0} 页，${Math.round(summary.elapsedMs / 1000)} 秒`,
        )
      } catch (error) {
        results.push({ id: sample.id, error: error.message })
        console.log(`未完成：${sample.id}，${error.message}`)
      }
    }
    if (!renderOnly)
      await fs.writeFile(
        path.join(output, 'results.json'),
        JSON.stringify({ material: '合成评测材料，不代表真实用户、赛事或公司', results }, null, 2),
      )
    if (results.some((result) => result.error || result.exportError || result.action !== 'create'))
      process.exitCode = 1
  } finally {
    window?.destroy()
    if (
      path.dirname(isolated) === path.resolve(os.tmpdir()) &&
      path.basename(isolated).startsWith('zp-ppt-evaluation-')
    ) {
      await fs.rm(isolated, { recursive: true, force: true })
    } else {
      console.error('评测临时目录校验失败，未执行清理。')
      process.exitCode = 1
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => app.exit(process.exitCode || 0))
