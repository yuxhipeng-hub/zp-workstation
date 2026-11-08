import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Keep acceptance tests off the user's desktop, including ready-to-show.
export async function launchHiddenElectron(directory, env) {
  const root = process.cwd()
  const entry = path.join(directory, 'hidden-electron.cjs')
  fs.writeFileSync(
    entry,
    `const electron = require('electron')
const { app, BrowserWindow } = electron
const Module = require('node:module')
const load = Module._load
const testElectron = Object.create(electron)
Object.defineProperty(testElectron, 'BrowserWindow', { value: new Proxy(BrowserWindow, {
  construct(Target, [options]) {
    return new Target({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } })
  }
}) })
Module._load = function (request, ...args) {
  return request === 'electron' ? testElectron : load.call(this, request, ...args)
}
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.on('browser-window-created', (_event, window) => window.webContents.setBackgroundThrottling(false))
BrowserWindow.prototype.show = function () { this.webContents.setBackgroundThrottling(false) }
BrowserWindow.prototype.focus = function () {}
app.focus = function () {}
app.getAppPath = () => ${JSON.stringify(root)}
require(${JSON.stringify(path.join(root, 'src/main/index.cjs'))})
`,
  )
  const app = await electron.launch({ args: [entry], env })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => {
      // Windows can clamp the initial bounds to the CI desktop's work area.
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 820)
    })
    await page.waitForFunction(() => globalThis.innerWidth >= 1280 && globalThis.innerHeight >= 800)
    return app
  } catch (error) {
    await app.close()
    throw error
  }
}
