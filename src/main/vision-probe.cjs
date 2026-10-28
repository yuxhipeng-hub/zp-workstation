const { deflateSync } = require('node:zlib')

// 无文字、无元数据提示的两张合成图片，颜色位置不同，避免把文字连通误判为识图。
function probeImage(colors) {
  const width = 300,
    height = 120
  const raw = Buffer.alloc((width * 3 + 1) * height, 255)
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1)
    raw[start] = 0
    for (let x = 0; x < width; x++) {
      const shape =
        (x - 50) ** 2 + (y - 60) ** 2 <= 28 ** 2
          ? 0
          : x >= 122 && x < 178 && y >= 32 && y < 88
            ? 1
            : y >= 28 && y <= 88 && Math.abs(x - 250) <= (y - 28) / 2
              ? 2
              : -1
      if (shape >= 0) for (let c = 0; c < 3; c++) raw[start + 1 + x * 3 + c] = colors[shape][c]
    }
  }
  const chunk = (type, data) => {
    const header = Buffer.alloc(4)
    header.writeUInt32BE(data.length)
    const payload = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of payload) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([header, payload, checksum])
  }
  const dimensions = Buffer.alloc(13)
  dimensions.writeUInt32BE(width)
  dimensions.writeUInt32BE(height, 4)
  dimensions[8] = 8
  dimensions[9] = 2
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', dimensions), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`
}
function visionProbe() {
  const red = [239, 68, 68],
    green = [34, 197, 94],
    blue = [37, 99, 235]
  return {
    images: [probeImage([red, green, blue]), probeImage([blue, red, green])],
    expected: [
      ['red:circle', 'green:square', 'blue:triangle'],
      ['blue:circle', 'red:square', 'green:triangle'],
    ],
    prompt:
      '按图片出现顺序，分别识别每张图从左到右的三个图形。只输出 JSON：{"images":[[{"color":"red|green|blue","shape":"circle|square|triangle"}]]}。images 必须对应全部图片，每张图三项；依据图片观察，不猜测缺失图像。',
  }
}
function checkVisionProbe(content, expected) {
  try {
    const parsed = JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    )
    return (
      JSON.stringify(
        parsed.images?.map((items) => items.map((item) => `${item.color}:${item.shape}`)),
      ) === JSON.stringify(expected)
    )
  } catch {
    return false
  }
}
module.exports = { visionProbe, checkVisionProbe }
