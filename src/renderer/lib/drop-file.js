/**
 * 把拖入的 File 解析成可交给主进程导入的本地路径。
 *
 * Explorer 拖入的文件带真实路径；WPS、Office 等办公软件可能只提供虚拟文件，
 * `webUtils.getPathForFile` 会返回空值甚至抛错。此时读取文件内容，交给主进程
 * 落到临时目录后再导入，不能因为一次路径解析失败就丢掉整个拖放。
 */
const MAX_DROPPED_FILE_SIZE = 200 * 1024 * 1024

/**
 * @param {{ path?: string, name?: string, size?: number, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @param {{
 *   getPathForFile?: (file: unknown) => string,
 *   stageDroppedFile?: (payload: { name: string, data: Uint8Array }) => Promise<{ path?: string }>,
 * }} [options]
 */
export async function resolveDroppedFileSource(file, { getPathForFile, stageDroppedFile } = {}) {
  let directPath = file?.path || ''
  try {
    if (typeof getPathForFile === 'function') {
      directPath = getPathForFile(file) || directPath
    }
  } catch {
    // 虚拟文件没有本地路径，继续走内容落盘兜底。
  }
  if (directPath) return directPath

  if (typeof stageDroppedFile !== 'function') {
    throw new Error('当前版本无法读取这个拖入文件，请先保存到本地。')
  }
  if (Number(file?.size) > MAX_DROPPED_FILE_SIZE) {
    throw new Error('拖入的单个文件超过 200 MB，请先保存到本地后再导入。')
  }

  let buffer
  try {
    buffer = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new Error('无法读取拖入文件的内容，请先在原软件中另存为本地文件。')
  }
  if (!buffer.length) {
    throw new Error('拖入的文件内容为空，请先在原软件中另存为本地文件。')
  }

  const staged = await stageDroppedFile({
    name: file?.name || 'dropped-file',
    data: buffer,
  })
  return staged?.path || ''
}
