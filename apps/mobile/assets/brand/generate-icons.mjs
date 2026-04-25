#!/usr/bin/env node
/**
 * Rasterize the four brand SVGs into the PNG paths app.config.js expects.
 *
 * Usage:
 *   node apps/mobile/assets/brand/generate-icons.mjs
 *
 * Reads from apps/mobile/assets/brand/*.svg and writes to apps/mobile/assets/.
 * Re-run any time the SVG sources change. The PNGs are committed alongside
 * the SVGs so EAS builds don't need to run this script.
 *
 * Requires `sharp` (already in the root node_modules).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const assetsRoot = resolve(here, '..')

async function rasterize(svgFile, pngFile, size) {
  const svg = await readFile(resolve(here, svgFile))
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const out = resolve(assetsRoot, pngFile)
  await writeFile(out, png)
  console.log(`  ✓ ${pngFile} (${size}×${size})`)
}

console.log('Generating Murmur brand PNGs from SVG sources…')
await rasterize('murmur-mark-cream.svg', 'icon.png', 1024)
await rasterize('murmur-mark-adaptive-foreground.svg', 'adaptive-icon.png', 1024)
await rasterize('murmur-mark-splash.svg', 'splash-icon.png', 1024)
await rasterize('murmur-mark-favicon.svg', 'favicon.png', 192)
console.log('Done.')
