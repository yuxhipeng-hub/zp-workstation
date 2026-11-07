import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Keep acceptance tests off the user's desktop, including ready-to-show.
export function launchHiddenElectron(directory, env) {
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
  return electron.launch({ args: [entry], env })
}
