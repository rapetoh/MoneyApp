// Renders the App Store product page header (design/header.html) to the
// exact size App Store Connect takes: 3840x1646, opaque (Apple refuses alpha).
//   node apps/mobile/store/apple/render-header.mjs
// Mac only: headless Chrome draws it at 2x, then sips flattens it (PNG to
// JPEG at quality 100 drops the alpha channel, back to PNG for upload).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SRC = path.join(HERE, 'design', 'header.html')
const OUT_DIR = path.join(HERE, 'header', 'en-US')
const OUT = path.join(OUT_DIR, 'header-3840x1646.png')

mkdirSync(OUT_DIR, { recursive: true })
const tmp = mkdtempSync(path.join(tmpdir(), 'murmur-header-'))
const raw = path.join(tmp, 'raw.png')
const flat = path.join(tmp, 'flat.jpg')

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${r.stderr}`)
  return r.stdout.toString()
}

run(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--user-data-dir=${path.join(tmp, 'profile')}`,
  '--allow-file-access-from-files', '--force-device-scale-factor=2',
  '--window-size=1920,823', '--virtual-time-budget=4000',
  `--screenshot=${raw}`, pathToFileURL(SRC).href,
])
if (!existsSync(raw)) throw new Error('Chrome wrote no screenshot')
run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', raw, '--out', flat])
run('sips', ['-s', 'format', 'png', flat, '--out', OUT])
const info = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', OUT])
rmSync(tmp, { recursive: true, force: true })
if (!/pixelWidth: 3840/.test(info) || !/pixelHeight: 1646/.test(info) || !/hasAlpha: no/.test(info)) {
  throw new Error('Header is not 3840x1646 opaque:\n' + info)
}
console.log('Wrote', path.relative(process.cwd(), OUT), '3840x1646, no alpha')
