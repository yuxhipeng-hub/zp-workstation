import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const installerPath = path.join(rootDir, 'node_modules', 'electron', 'install.js')

if (!existsSync(installerPath) || process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  process.exit(0)
}

function installElectron(extraEnv = {}) {
  return spawnSync(process.execPath, [installerPath], {
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
}

const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
let result = installElectron({ ELECTRON_MIRROR: mirror })

if (result.status !== 0) {
  console.warn('Electron mirror download failed; retrying the official source...')
  result = installElectron({ ELECTRON_MIRROR: '' })
}

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
