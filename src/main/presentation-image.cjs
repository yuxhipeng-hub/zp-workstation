const fs = require('node:fs/promises')
const path = require('node:path')
const { imageDimensions } = require('../shared/presentation-canvas.mjs')

/** 只处理用户通过系统对话框主动选择的图片，结果进入作品并随正式备份保存。 */
async function readPresentationImage(filePath, decodeImage) {
  if (
    typeof filePath !== 'string' ||
    !path.isAbsolute(filePath) ||
    !/\.(png|jpe?g)$/i.test(filePath)
  )
    throw new Error('请选择本机 PNG 或 JPEG 图片。')
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new Error('图片最多 12 MB。')
  const bytes = await fs.readFile(filePath)
  if (!(
    (bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG') ||
    (bytes[0] === 0xff && bytes[1] === 0xd8)
  ))
    throw new Error('图片格式不正确。')
  const metadata = imageDimensions(bytes)
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40000000)
    throw new Error('图片尺寸过大或无效。')
  const image = decodeImage(bytes)
  if (image.isEmpty()) throw new Error('无法解码这张图片。')
  const size = image.getSize()
  if (!size.width || !size.height || size.width * size.height > 40000000)
    throw new Error('图片尺寸过大或无效。')
  let width = Math.min(1600, size.width)
  let compressed
  do {
    const resized = image.resize({
      width,
      height: Math.max(1, Math.round((size.height * width) / size.width)),
      quality: 'best',
    })
    compressed = bytes[0] === 0x89 ? resized.toPNG() : resized.toJPEG(85)
    width = Math.floor(width * 0.8)
  } while (compressed.length > 580000 && width >= 160)
  if (compressed.length > 580000) throw new Error('图片压缩后仍过大，请先裁切后再导入。')
  return {
    name: path.basename(filePath).slice(0, 80),
    data: `data:image/${bytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${compressed.toString('base64')}`,
    width: size.width,
    height: size.height,
  }
}
module.exports = { readPresentationImage }
