#!/usr/bin/env node
// Render the App Store screenshots from their design source.
//
// Set v3 (Nov 2026, docs/app-store-screenshots.md): Fraunces headlines from
// the website, real photography, real merchant logos, the app's own UI fonts,
// 10 iPhone + 5 iPad frames in selling order.
//
// The source of truth is the standalone screenshot bundle in docs/ (a
// self-contained HTML page: React + Babel + the shot components + every
// image, all inlined). This script unpacks it, serves it, and drives
// headless Chrome once per shot, writing PNGs at exactly the pixel sizes
// App Store Connect requires. Each canvas is authored at half scale and
// captured at device-scale-factor 2.
//
//   node apps/mobile/store/apple/render-screenshots.mjs            # all
//   node apps/mobile/store/apple/render-screenshots.mjs 07-budgets # some
//
// New York and SF Rounded (the app's serif and the widget/lock-screen
// numerals) are Apple system fonts: the bundle asks for sysfont/<file> and
// this server answers from /System/Library/Fonts, so they are never copied
// into the repo. Run it on a Mac.
//
// Why a script and not a manual export: the shipped 1.0.0 listing went to
// App Review with six budget rows reading "$NaN left" (two modules in the
// bundle both declared `BudgetRow`, and the desktop one, loaded second,
// won). Regenerating has to be repeatable so a fix like that reaches the
// store instead of living in someone's browser tab.
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { gunzipSync, inflateSync, deflateSync, crc32 } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')
const BUNDLE = process.env.SHOTS_BUNDLE
  ?? path.join(REPO, 'docs', 'Murmur App Store Screenshots v3 (Standalone).html')
const SYSFONTS = '/System/Library/Fonts'
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = path.join(HERE, 'screenshot', 'en-US')

// id, authored canvas size, device folder, file name. Authored size x2 is
// the submitted pixel size: iPhone 6.5" 1284x2778, iPad 13" 2064x2752.
const SHOTS = [
  ['ip-01', 642, 1389, 'APP_IPHONE_65', '01-voice.png'],
  ['ip-02', 642, 1389, 'APP_IPHONE_65', '02-apple-pay.png'],
  ['ip-03', 642, 1389, 'APP_IPHONE_65', '03-ask-murmur.png'],
  ['ip-04', 642, 1389, 'APP_IPHONE_65', '04-privacy.png'],
  ['ip-05', 642, 1389, 'APP_IPHONE_65', '05-anywhere.png'],
  ['ip-06', 642, 1389, 'APP_IPHONE_65', '06-insights.png'],
  ['ip-07', 642, 1389, 'APP_IPHONE_65', '07-budgets.png'],
  ['ip-08', 642, 1389, 'APP_IPHONE_65', '08-recurring.png'],
  ['ip-09', 642, 1389, 'APP_IPHONE_65', '09-businesses.png'],
  ['ip-10', 642, 1389, 'APP_IPHONE_65', '10-import.png'],
  // No frame may mention a price or "free" (App Store 2.3.7).
  ['pad-01', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '01-voice.png'],
  ['pad-02', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '02-apple-pay.png'],
  ['pad-03', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '03-ask-murmur.png'],
  ['pad-04', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '04-privacy.png'],
  ['pad-05', 1032, 1376, 'APP_IPAD_PRO_3GEN_129', '05-anywhere.png'],
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Chrome's PNG encoder stalls on captures above roughly 4 million pixels
// (every iPad frame is 5.7M), so frames are captured in bands it can encode
// and joined here. Minimal codec for Chrome's own output: 8-bit RGB/RGBA,
// not interlaced.
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) throw new Error('unexpected PNG format')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0
      const b = y ? px[row - stride + i] : 0
      const c = y && i >= bpp ? px[row - stride + i - bpp] : 0
      let v = raw[src + i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[row + i] = v & 255
    }
  }
  return { width, height, colorType, bpp, px }
}

function encodePng({ width, height, colorType, bpp, px }) {
  const stride = width * bpp
  const raw = Buffer.alloc((stride + 1) * height)
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride))
  for (let y = 0; y < height; y++) {
    const row = y * stride
    let best = 0, bestScore = Infinity
    for (let f = 0; f < 5; f++) {
      const out = cand[f]
      let score = 0
      for (let i = 0; i < stride; i++) {
        const x = px[row + i]
        const a = i >= bpp ? px[row + i - bpp] : 0
        const b = y ? px[row - stride + i] : 0
        const c = y && i >= bpp ? px[row - stride + i - bpp] : 0
        let p = 0
        if (f === 1) p = a
        else if (f === 2) p = b
        else if (f === 3) p = (a + b) >> 1
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
        const v = (x - p) & 255
        out[i] = v
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) { bestScore = score; best = f }
    }
    raw[y * (stride + 1)] = best
    cand[best].copy(raw, y * (stride + 1) + 1)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function joinBands(bands) {
  const parts = bands.map(decodePng)
  const { width, colorType, bpp } = parts[0]
  if (parts.some((p) => p.width !== width || p.colorType !== colorType)) throw new Error('bands do not match')
  return encodePng({ width, colorType, bpp, height: parts.reduce((n, p) => n + p.height, 0), px: Buffer.concat(parts.map((p) => p.px)) })
}

// Minimal DevTools protocol client over Node's built-in WebSocket.
async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    const p = m.id && pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result)
  }
  return {
    send: (method, params = {}) => new Promise((res, rej) => {
      const id = ++seq
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    }),
    close: () => ws.close(),
  }
}

let server
let chrome
try {
  if (!existsSync(BUNDLE)) throw new Error(`screenshot bundle not found: ${BUNDLE}`)
  if (!existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME} (set CHROME_BIN)`)
  console.log('bundle :', BUNDLE)
  const mimes = unpack(BUNDLE, dir)
  console.log('unpacked', Object.keys(mimes).length, 'entries ->', dir)

  server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0].replace(/^\//, '')) || 'index.html'
    if (name.startsWith('sysfont/')) {
      const font = path.join(SYSFONTS, path.basename(name))
      if (!existsSync(font)) { res.writeHead(404).end('not found'); return }
      res.writeHead(200, { 'Content-Type': 'font/ttf' })
      res.end(readFileSync(font))
      return
    }
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

  // One headless Chrome, driven over the DevTools protocol: load the page
  // once, freeze animations, then capture each canvas by its bounding box
  // at device scale 2. (The old per-shot `--screenshot` mode stopped
  // producing output on current Chrome: every shot hit the timeout.)
  const profile = mkdtempSync(path.join(tmpdir(), 'murmur-chrome-'))
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 300 && !existsSync(portFile); i++) await sleep(100)
  if (!existsSync(portFile)) throw new Error('Chrome did not start')
  const devPort = readFileSync(portFile, 'utf8').split('\n')[0].trim()
  const targets = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json()
  const cdp = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1450, deviceScaleFactor: 2, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` })
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value

  // index.html#<id> renders that canvas alone at the top-left (V2Page), so
  // each capture is a small page; animations are frozen so every run matches.
  let failed = 0
  for (const [id, w, h, device, file] of wanted) {
    const out = path.join(OUT, device, file)
    mkdirSync(path.dirname(out), { recursive: true })
    await evaluate(`location.hash = ${JSON.stringify(id)}`)
    let box = null
    for (let i = 0; i < 240 && !box; i++) {
      await sleep(250)
      box = await evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return null
        const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } })()`)
    }
    if (box) {
      await evaluate(`(async () => {
        if (!document.getElementById('freeze')) {
          const st = document.createElement('style'); st.id = 'freeze'
          st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
          document.head.appendChild(st)
        }
        await document.fonts.ready
        await Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r })))
        await new Promise((r) => setTimeout(r, 400))
      })()`)
      // Bands of at most 300 CSS rows (600 device rows), joined into one PNG.
      const bands = []
      for (let top = 0; top < box.h; top += 300) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png',
          clip: { x: box.x, y: box.y + top, width: box.w, height: Math.min(300, box.h - top), scale: 1 } })
        bands.push(Buffer.from(shot.data, 'base64'))
      }
      writeFileSync(out, joinBands(bands))
    }
    const probe = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out], { encoding: 'utf8' })
    const got = (probe.stdout.match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/) ?? []).slice(1).map(Number)
    const ok = got[0] === w * 2 && got[1] === h * 2
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${device}/${file}  ${got.join('x') || 'no output'}  (want ${w * 2}x${h * 2})`)
  }
  cdp.close()
  if (failed) { console.error(`${failed} shot(s) did not render at the required size`); process.exitCode = 1 }
} finally {
  chrome?.kill('SIGKILL')
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
