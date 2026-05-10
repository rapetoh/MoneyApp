#!/usr/bin/env node
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const execFile = promisify(execFileCb)
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const sourceSvg = resolve(repoRoot, 'apps/mobile/assets/brand/murmur-mark-cream.svg')
const buildDir = resolve(here, '..', 'build')
const outIcns = resolve(buildDir, 'icon.icns')
const outIco = resolve(buildDir, 'icon.ico')
const outIconPng = resolve(buildDir, 'icon.png')

if (!existsSync(sourceSvg)) {
  console.error(`Source SVG not found at ${sourceSvg}`)
  process.exit(1)
}

await mkdir(buildDir, { recursive: true })

// macOS .icns spec — sizes Apple expects in an iconset.
const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]

const tmp = await mkdtemp(join(tmpdir(), 'murmur-icns-'))
const iconset = join(tmp, 'Murmur.iconset')
await mkdir(iconset, { recursive: true })

console.log(`Rasterizing ${sourceSvg}…`)
for (const { name, size } of sizes) {
  const png = await sharp(sourceSvg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 244, g: 241, b: 234, alpha: 1 } })
    .png()
    .toBuffer()
  await writeFile(join(iconset, name), png)
}

// Generic 1024 png for electron-builder fallback (linux/windows + dock fallback).
const png1024 = await sharp(sourceSvg, { density: 384 })
  .resize(1024, 1024, { fit: 'contain', background: { r: 244, g: 241, b: 234, alpha: 1 } })
  .png()
  .toBuffer()
await writeFile(outIconPng, png1024)

console.log('Running iconutil…')
await execFile('iconutil', ['-c', 'icns', iconset, '-o', outIcns])
await rm(tmp, { recursive: true, force: true })
console.log(`✓ ${outIcns}`)
console.log(`✓ ${outIconPng}`)

// Windows .ico — pack the standard ICO sizes (16, 24, 32, 48, 64, 128, 256)
// from the same brand SVG.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoBuffers = await Promise.all(
  icoSizes.map((size) =>
    sharp(sourceSvg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 244, g: 241, b: 234, alpha: 1 } })
      .png()
      .toBuffer(),
  ),
)
await writeFile(outIco, await pngToIco(icoBuffers))
console.log(`✓ ${outIco}`)
