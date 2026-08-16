#!/usr/bin/env node
/**
 * Rasterize the four brand SVGs into the PNG paths app.config.js expects,
 * plus the web app's icon (Next.js `app/icon.png`, same 192 px favicon).
 *
 * Usage:
 *   node apps/mobile/assets/brand/generate-icons.mjs
 *
 * Reads from apps/mobile/assets/brand/*.svg and writes to apps/mobile/assets/
 * and apps/web/src/app/icon.png. Re-run any time the SVG sources change.
 * The PNGs are committed alongside the SVGs so EAS/Vercel builds don't
 * need to run this script. The desktop .icns/.ico are built from the same
 * cream SVG by `npm run icns -w @voice-expense/desktop`
 * (apps/desktop/scripts/generate-icns.mjs) — run both after a mark change.
 *
 * Requires `sharp` (already in the root node_modules).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const assetsRoot = resolve(here, '..')
const webAppRoot = resolve(here, '../../../web/src/app')

async function rasterize(svgFile, outFiles, size) {
  const svg = await readFile(resolve(here, svgFile))
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  for (const out of outFiles) {
    await writeFile(out, png)
    console.log(`  ✓ ${out} (${size}×${size})`)
  }
}

console.log('Generating Murmur brand PNGs from SVG sources…')
await rasterize('murmur-mark-cream.svg', [resolve(assetsRoot, 'icon.png')], 1024)
await rasterize('murmur-mark-adaptive-foreground.svg', [resolve(assetsRoot, 'adaptive-icon.png')], 1024)
await rasterize('murmur-mark-splash.svg', [resolve(assetsRoot, 'splash-icon.png')], 1024)
await rasterize(
  'murmur-mark-favicon.svg',
  [resolve(assetsRoot, 'favicon.png'), resolve(webAppRoot, 'icon.png')],
  192,
)
console.log('Done.')
