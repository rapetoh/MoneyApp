#!/usr/bin/env node
// Render the App Store screenshots from their design source.
//
// The source of truth is the standalone screenshot bundle in docs/ (a
// self-contained HTML page: React + Babel + the shot components + every
// image, all inlined). This script unpacks it, serves it, and drives
// headless Chrome once per shot, writing PNGs at exactly the pixel sizes
// App Store Connect requires. Each canvas is authored at half scale and
// captured at device-scale-factor 2.
//
//   node apps/mobile/store/apple/render-screenshots.mjs            # all
//   node apps/mobile/store/apple/render-screenshots.mjs 06-budgets # some
//
// Why a script and not a manual export: the shipped 1.0.0 listing went to
// App Review with six budget rows reading "$NaN left" (two modules in the
// bundle both declared `BudgetRow`, and the desktop one, loaded second,
// won). Regenerating has to be repeatable so a fix like that reaches the
// store instead of living in someone's browser tab.
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { gunzipSync, inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')
const BUNDLE = process.env.SHOTS_BUNDLE
  ?? path.join(REPO, 'docs', 'Murmur App Store Screenshots (Standalone) (1).html')
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = path.join(HERE, 'screenshot', 'en-US')

// id, authored canvas size, device folder, file name. Authored size x2 is
// the submitted pixel size: iPhone 6.5" 1284x2778, iPad 13" 2064x2752.
const SHOTS = [
  ['shot-ip-01', 642, 1389, 'APP_IPHONE_65', '01-hero.png'],
  ['shot-ip-02', 642, 1389, 'APP_IPHONE_65', '02-voice.png'],
  ['shot-ip-03', 642, 1389, 'APP_IPHONE_65', '03-confirm.png'],
  ['shot-ip-04', 642, 1389, 'APP_IPHONE_65', '04-apple-pay.png'],
  ['shot-ip-05', 642, 1389, 'APP_IPHONE_65', '05-insights.png'],
  ['shot-ip-06', 642, 1389, 'APP_IPHONE_65', '06-budgets.png'],
  ['shot-ip-07', 642, 1389, 'APP_IPHONE_65', '07-recurring.png'],
  ['shot-ip-08', 642, 1389, 'APP_IPHONE_65', '08-ask-murmur.png'],
  ['shot-ip-09', 642, 1389, 'APP_IPHONE_65', '09-privacy.png'],
  // shot-ip-10 ("Start free. Stay free.") is deliberately NOT submitted:
  // App Store 2.3.7 forbids price references in screenshots, and Apple
  // counts "free" as one. It stays in the bundle for the marketing site.
  ['shot-pad-01', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '01-hero.png'],
  ['shot-pad-02', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '02-voice-flow.png'],
  ['shot-pad-03', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '03-understand.png'],
  ['shot-pad-04', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '04-patterns.png'],
  ['shot-pad-05', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '05-private.png'],
]

// Brings one shot canvas to the viewport's top-left by translating the
// page. Nothing is hidden or reparented on purpose: the Murmur coin mark
// paints from an SVG gradient that stops resolving if its defining
// subtree is removed from the render tree, which silently drops the logo.
const ISOLATE = `
<script>
window.addEventListener('load', function () {
  var id = location.hash.slice(1)
  if (!id) return
  setTimeout(function () {
    var el = document.getElementById(id)
    if (!el) { document.title = 'MISSING:' + id; return }
    var r = el.getBoundingClientRect()
    document.body.style.transform = 'translate(' + (-Math.round(r.left)) + 'px,' + (-Math.round(r.top)) + 'px)'
    document.body.style.transformOrigin = '0 0'
    document.documentElement.style.overflow = 'hidden'
  }, 700)
})
</script>
`

function unpack(bundlePath, dir) {
  const html = readFileSync(bundlePath, 'utf8')
  const grab = (type) => {
    const m = html.match(new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`))
    if (!m) throw new Error(`bundle has no ${type} block: ${bundlePath}`)
    return JSON.parse(m[1].trim())
  }
  const manifest = grab('manifest')
  const extResources = grab('ext_resources')
  let template = grab('template')

  // Chrome refuses to run a <script src> served as application/octet-stream,
  // so the server has to hand back each entry's real MIME type. The bundle
  // files are named by bare uuid, with no extension to infer one from.
  const mimes = {}
  for (const [uuid, entry] of Object.entries(manifest)) {
    let bytes = Buffer.from(entry.data ?? '', 'base64')
    if (entry.compressed) {
      try { bytes = gunzipSync(bytes) } catch { try { bytes = inflateSync(bytes) } catch { /* raw */ } }
    }
    writeFileSync(path.join(dir, uuid), bytes)
    mimes[uuid] = entry.mime || 'application/octet-stream'
  }

  // Assets are referenced by id through window.__resources; served from
  // the same directory, the uuid filename is the URL.
  const resources = {}
  for (const e of extResources) if (manifest[e.uuid]) resources[e.id] = e.uuid

  // SRI + crossorigin are for the CDN-hosted original; over plain http
  // from this temp dir they only cause CORS failures.
  template = template.replace(/\s+integrity="[^"]*"/gi, '').replace(/\s+crossorigin="[^"]*"/gi, '')
  const head = template.match(/<head[^>]*>/i)
  const inject = `<script>window.__resources=${JSON.stringify(resources)};</script>`
  template = template.slice(0, head.index + head[0].length) + inject + template.slice(head.index + head[0].length)
  template = template.replace('</body>', ISOLATE + '</body>')
  writeFileSync(path.join(dir, 'index.html'), template)
  return mimes
}

const dir = mkdtempSync(path.join(tmpdir(), 'murmur-shots-'))
let server
try {
  if (!existsSync(BUNDLE)) throw new Error(`screenshot bundle not found: ${BUNDLE}`)
  if (!existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME} (set CHROME_BIN)`)
  console.log('bundle :', BUNDLE)
  const mimes = unpack(BUNDLE, dir)
  console.log('unpacked', Object.keys(mimes).length, 'entries ->', dir)

  server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0].replace(/^\//, '')) || 'index.html'
    const file = path.join(dir, name)
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html' : (mimes[name] ?? 'application/octet-stream') })
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  console.log('serving on', port)

  const only = process.argv.slice(2)
  const wanted = only.length ? SHOTS.filter((s) => only.some((o) => s[4].includes(o) || s[0].includes(o))) : SHOTS
  if (!wanted.length) throw new Error(`no shots matched ${only.join(', ')}`)

  let failed = 0
  for (const [id, w, h, device, file] of wanted) {
    const out = path.join(OUT, device, file)
    // Chrome occasionally never exits on its own here; the timeout keeps a
    // stuck instance from wedging the whole run, and the size probe below
    // reports the shot as FAIL so it can be retried.
    spawnSync(CHROME, [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=12000', '--force-device-scale-factor=2',
      `--window-size=${w},${h}`, `--screenshot=${out}`,
      `http://127.0.0.1:${port}/index.html#${id}`,
    ], { stdio: 'ignore', timeout: 120000, killSignal: 'SIGKILL' })

    const probe = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out], { encoding: 'utf8' })
    const got = (probe.stdout.match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/) ?? []).slice(1).map(Number)
    const ok = got[0] === w * 2 && got[1] === h * 2
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${device}/${file}  ${got.join('x') || 'no output'}  (want ${w * 2}x${h * 2})`)
  }
  if (failed) { console.error(`${failed} shot(s) did not render at the required size`); process.exitCode = 1 }
} finally {
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
