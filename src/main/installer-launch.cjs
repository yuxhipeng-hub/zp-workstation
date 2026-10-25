const fs = require('node:fs')
const { spawn } = require('node:child_process')

// electron-builder 的 NSIS 脚本只在收到 `--updated` 时进入原位升级分支：
// 跳过安装向导页面，保留桌面/开始菜单快捷方式，并在调用旧卸载器时带
// `--keep-shortcuts`，不再注销 AppUserModelID，所以任务栏固定项也不会被
// 清掉。直接打开安装包（不带参数）会被当成全新安装，旧卸载器会删除快捷
// 方式并注销 AppUserModelID，随后安装器再新建一份，表现为快捷方式多一个、
// 任务栏图标变化。`/currentuser` 让安装模式页直接跳过，和安装器只允许每
// 用户安装的配置保持一致。
const UPDATE_INSTALLER_ARGS = ['--updated', '/currentuser']

function launchUpdateInstaller(filePath, { spawnImpl = spawn, logger = null } = {}) {
  const target = String(filePath || '').trim()
  if (!target) throw new Error('安装包路径为空。')
  if (!fs.existsSync(target)) throw new Error(`安装包不存在：${target}`)

  const child = spawnImpl(target, UPDATE_INSTALLER_ARGS, {
    detached: true,
    stdio: 'ignore',
  })
  // 已忽略 stdio 的 detached 子进程如果启动失败会抛出未处理的 error 事件，
  // 那会把主进程一起带崩，所以必须显式接住并留下日志。
  child.on('error', (error) => {
    logger?.error('launcher-update', `安装程序启动失败：${error.message}`)
  })
  child.unref()
  return child
}

module.exports = { UPDATE_INSTALLER_ARGS, launchUpdateInstaller }
