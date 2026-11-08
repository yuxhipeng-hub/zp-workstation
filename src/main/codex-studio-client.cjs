const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const path = require('node:path')
const fs = require('node:fs')
function locateCodex() {
  const managed = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ZP Workbench', 'tools', 'codex')
    : ''
  for (const dir of [managed, ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean)) {
    const native = path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex')
    if (fs.existsSync(native)) return native
    if (process.platform === 'win32') {
      const root = path.join(dir, 'node_modules', '@openai', 'codex')
      try {
        const pkg = require.resolve('@openai/codex-win32-x64/package.json', { paths: [root] })
        const bin = path.join(
          path.dirname(pkg),
          'vendor',
          'x86_64-pc-windows-msvc',
          'bin',
          'codex.exe',
        )
        if (fs.existsSync(bin)) return bin
      } catch {
        /* 此 PATH 项没有 npm Codex 安装，继续查找。 */
      }
    }
  }
  throw new Error('未找到 Codex 原生程序。请安装 @openai/codex 并登录，然后重启 Workbench。')
}
class CodexStudioClient {
  constructor({ binary = '', spawnImpl = spawn } = {}) {
    this.binary = binary
    this.spawn = spawnImpl
    this.pending = new Map()
    this.seq = 0
    this.child = null
    this.onEvent = (_e) => {}
    this.onDisconnect = () => {}
    this.disabledMcp = { node_repl: { command: 'node', enabled: false, required: false } }
    this.connecting = null
  }
  async connect(cwd) {
    if (this.connecting) return this.connecting
    if (this.child) return
    this.connecting = this.open(cwd)
    try {
      return await this.connecting
    } catch (e) {
      this.child?.kill()
      this.child = null
      throw e
    } finally {
      this.connecting = null
    }
  }
  async open(cwd) {
    const env = { ...process.env }
    for (const key of Object.keys(env))
      if (key.startsWith('CODEX_') && key !== 'CODEX_HOME') delete env[key]
    const args = [
      '--disable',
      'view_image',
      '--disable',
      'shell_tool',
      '--disable',
      'apps',
      '--disable',
      'plugins',
      '-c',
      'features.code_mode_host=false',
      '-c',
      'features.image_generation=false',
      '-c',
      'features.multi_agent=false',
      '-c',
      'features.memories=false',
      '-c',
      'features.hooks=false',
      '-c',
      'web_search="disabled"',
      'app-server',
    ]
    const child = this.spawn(this.binary || locateCodex(), args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    const closed = () => {
      if (this.child !== child) return
      this.child = null
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(
          new Error(
            'Codex 连接断开或版本不兼容；需要支持 --disable view_image 的版本（已验证 0.167.0）。已有结果保留。',
          ),
        )
      }
      this.pending.clear()
      this.onDisconnect()
    }
    child.on('error', closed)
    child.stdin.on('error', closed)
    child.on('close', closed)
    child.stderr.on('data', () => {})
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (this.child !== child) return
      if (line.length > 2000000) {
        child.kill()
        return
      }
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg.id != null && msg.method) {
        child.stdin.write(
          JSON.stringify({
            id: msg.id,
            error: {
              code: -32601,
              message: 'Workbench does not authorize runtime tools or escalations',
            },
          }) + '\n',
        )
        this.onEvent({
          method: 'studio/denied',
          params: { message: '工具或权限请求已拒绝；请使用工作室受控操作。' },
        })
        return
      }
      const pending = this.pending.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(msg.id)
        if (msg.error)
          pending.reject(
            new Error('Codex 协议请求失败：' + String(msg.error.message).slice(0, 500)),
          )
        else pending.resolve(msg.result)
      } else if (msg.method) this.onEvent(msg)
    })
    await this.request('initialize', {
      clientInfo: { name: 'zp_workbench', version: '0.7.0' },
      capabilities: { experimentalApi: false },
    })
    this.notify('initialized', {})
    const config = await this.request('config/read', { includeLayers: false, cwd })
    for (const name of Object.keys(config.config?.mcp_servers || {}))
      this.disabledMcp[name] = { command: 'node', enabled: false, required: false }
  }
  notify(method, params) {
    if (this.child?.stdin.writable)
      this.child.stdin.write(JSON.stringify({ method, params }) + '\n')
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin.writable) {
        reject(new Error('Codex 未连接。'))
        return
      }
      const id = ++this.seq,
        timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error('Codex 请求超时，请核查连接后恢复。'))
        }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
  async info(cwd) {
    await this.connect(cwd)
    const account = await this.request('account/read', { refreshToken: false })
    const models = await this.request('model/list', {})
    return {
      authenticated: !!account.account,
      authType: account.account?.type || '',
      models: (models.data || []).map((m) => ({
        id: m.model,
        name: m.displayName,
        default: m.isDefault,
      })),
      binary: this.binary || locateCodex(),
    }
  }
  async thread({ cwd, threadId, model }) {
    const params = {
      cwd,
      model,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      config: {
        'features.shell_tool': false,
        web_search: 'disabled',
        mcp_servers: this.disabledMcp,
      },
      developerInstructions:
        '你是视频总导演。仅讨论明确提供的制作材料，输出结构化结果；禁止调用工具、读取其他目录、执行代码、网络、修改文件或提交付费任务。后期由 Workbench 受控执行器完成。',
    }
    return this.request(threadId ? 'thread/resume' : 'thread/start', {
      ...params,
      ...(threadId ? { threadId } : {}),
    })
  }
  close() {
    const child = this.child
    if (child) child.kill()
  }
}
module.exports = { CodexStudioClient, locateCodex }
