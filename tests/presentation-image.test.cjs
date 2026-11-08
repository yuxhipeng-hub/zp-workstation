const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { readPresentationImage } = require('../src/main/presentation-image.cjs')
const { validateImageData, imageDimensions } = require('../src/shared/presentation-canvas.mjs')

test('image import validates metadata before decode and preserves PNG transparency', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-ppt-image-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const png = await sharp({
    create: {
      width: 64,
      height: 32,
      channels: 4,
      background: { r: 30, g: 90, b: 120, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer()
  const target = path.join(directory, 'sample.png')
  await fs.writeFile(target, png)
  let decoded = 0
  const decode = () => {
    decoded++
    return {
      isEmpty: () => false,
      getSize: () => ({ width: 64, height: 32 }),
      resize: () => ({ toPNG: () => png }),
    }
  }
  const result = await readPresentationImage(target, decode)
  assert.equal(result.name, 'sample.png')
  assert.equal(validateImageData(result.data), result.data)
  assert.equal(
    (await sharp(Buffer.from(result.data.split(',')[1], 'base64')).metadata()).hasAlpha,
    true,
  )
  assert.deepEqual(imageDimensions(png), { width: 64, height: 32 })
  await assert.rejects(readPresentationImage('relative.png', decode), /本机/)
  const huge = Buffer.from(png)
  huge.writeUInt32BE(100000, 16)
  huge.writeUInt32BE(100000, 20)
  await fs.writeFile(target, huge)
  await assert.rejects(readPresentationImage(target, decode), /尺寸/)
  assert.equal(decoded, 1)
  await fs.writeFile(target, 'not an image')
  await assert.rejects(readPresentationImage(target, decode), /格式/)
  assert.throws(() => validateImageData('https://example.com/photo.png'), /PNG/)
  assert.throws(() => validateImageData(result.data.replace('image/png', 'image/jpeg')), /格式/)
})

test('image dimension parser handles JPEG metadata and truncated images', async () => {
  const jpeg = await sharp({
    create: { width: 81, height: 49, channels: 3, background: '#222222' },
  })
    .jpeg()
    .toBuffer()
  assert.deepEqual(imageDimensions(jpeg), { width: 81, height: 49 })
  assert.throws(() => imageDimensions(jpeg.subarray(0, 12)), /尺寸/)
})
