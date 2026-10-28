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
const { SettingsStore } = require('../src/main/settings-store.cjs')
const { AiService } = require('../src/main/ai-service.cjs')
const { getPresentationIssues, buildSlideScene } = require('../src/shared/presentation.mjs')
const { presentationBuffer } = require('../src/main/presentation-export.cjs')
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
    const profile = reference || renderOnly ? null : service.resolveProfile()
    if (!reference && !renderOnly && !profile) throw new Error('桌面应用尚未配置可用模型。')
    await fs.mkdir(output, { recursive: true })
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
