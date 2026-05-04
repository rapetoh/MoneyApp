#!/usr/bin/env node
/**
 * Stage the Next.js standalone bundle inside apps/desktop/dist/web/ so
 * electron-builder can copy a single self-contained tree into the .app
 * Resources directory.
 *
 * Standalone output (`output: 'standalone'` in next.config.ts) only
 * includes the server runtime + traced node_modules — `.next/static/`
 * and `public/` must be copied alongside it for the server to serve
 * client assets and public files.
 */
import { cp, rm, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '..')
const repoRoot = resolve(desktopRoot, '../..')
const webRoot = resolve(repoRoot, 'apps/web')

const standaloneSrc = resolve(webRoot, '.next/standalone')
const staticSrc = resolve(webRoot, '.next/static')
const publicSrc = resolve(webRoot, 'public')

const stageRoot = resolve(desktopRoot, 'dist/web')
const standaloneDst = stageRoot
const staticDst = resolve(stageRoot, 'apps/web/.next/static')
const publicDst = resolve(stageRoot, 'apps/web/public')

async function ensureExists(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label} at ${path}.`)
    console.error('Did `npm --prefix apps/web run build` succeed?')
    process.exit(1)
  }
}

await ensureExists(standaloneSrc, 'standalone bundle')
await ensureExists(staticSrc, '.next/static')

console.log('Bundling Next.js standalone server for Electron…')
await rm(stageRoot, { recursive: true, force: true })
await mkdir(stageRoot, { recursive: true })

await cp(standaloneSrc, standaloneDst, { recursive: true })
console.log(`  ✓ standalone → ${standaloneDst}`)

await cp(staticSrc, staticDst, { recursive: true })
console.log(`  ✓ static → ${staticDst}`)

if (existsSync(publicSrc)) {
  const s = await stat(publicSrc)
  if (s.isDirectory()) {
    await cp(publicSrc, publicDst, { recursive: true })
    console.log(`  ✓ public → ${publicDst}`)
  }
}

console.log('Done.')
