import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(import.meta.dirname, '..')
const buildDir = resolve(root, 'build')
const source = await readFile(resolve(root, 'assets/icon.svg'))

await mkdir(buildDir, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngPaths = []

for (const size of sizes) {
  const target = resolve(buildDir, `icon-${size}.png`)
  await sharp(source, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toFile(target)
  pngPaths.push(target)
}

await sharp(source, { density: 384 }).resize(512, 512).png().toFile(resolve(buildDir, 'icon.png'))
const ico = await pngToIco(pngPaths)
await writeFile(resolve(buildDir, 'icon.ico'), ico)

console.log(`Generated ${sizes.length} PNG sizes and build/icon.ico`)
