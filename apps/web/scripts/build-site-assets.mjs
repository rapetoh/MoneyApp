/**
 * Rebuilds the marketing images the landing page serves.
 *
 *   node scripts/build-site-assets.mjs shots        # phone screens -> public/shots
 *   node scripts/build-site-assets.mjs og [url]     # hero -> public/og.png
 *   node scripts/build-site-assets.mjs all [url]
 *
 * `shots` resizes the submitted App Store screenshots (the same files Apple
 * shows on the listing, so the site and the store can never disagree) into
 * web-sized webp.
 *
 * `og` photographs the site's own hero at 1200x630 for link previews, which
 * keeps the share card from drifting away from the page it promises. It
 * needs the site running locally (`npm run build && npx next start -p 3000`)
 * and drives headless Chrome over the DevTools protocol: `--window-size`
 * cannot be trusted for exact viewports, since the OS clamps window width.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// sharp ships with Next (image optimization), so there is nothing extra
// to install for this dev-only script.
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '..')
const REPO = path.resolve(WEB, '../..')
const STORE = path.join(REPO, 'apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65')
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// Source file -> the name the page asks for. Order matches the page.
const SHOTS = [
  ['02-voice.png', 'voice'],
  ['03-confirm.png', 'confirm'],
  ['05-insights.png', 'insights'],
  ['04-apple-pay.png', 'applepay'],
  ['07-recurring.png', 'recurring'],
  ['08-ask-murmur.png', 'ask'],
]

const kb = (f) => (statSync(f).size / 1024).toFixed(0) + 'KB'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function buildShots() {
  const out = path.join(WEB, 'public/shots')
  mkdirSync(out, { recursive: true })
  for (const [src, name] of SHOTS) {
    const file = path.join(out, name + '.webp')
    await sharp(path.join(STORE, src)).resize(560).webp({ quality: 82 }).toFile(file)
    console.log('shots:', name + '.webp', kb(file))
  }
}

/** Screenshot `url` at an exact CSS viewport and return the PNG buffer. */
async function shoot(url, width, height) {
  const port = 9300 + Math.floor(Math.random() * 90)
  const profile = mkdtempSync(path.join(tmpdir(), 'murmur-og-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank',
  ])
  try {
    let version
    for (let i = 0; i < 60 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
      } catch {
        await wait(250)
      }
    }
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve) => (ws.onopen = resolve))
    let id = 0
    const pending = new Map()
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result)
        pending.delete(msg.id)
      }
    }
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve) => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params, sessionId }))
      })

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 2, mobile: false },
      sessionId,
    )
    await send('Page.navigate', { url }, sessionId)
    await wait(3500)
    const { data } = await send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } },
      sessionId,
    )
    return Buffer.from(data, 'base64')
  } finally {
    chrome.kill()
  }
}

async function buildOg(url) {
  // 288 device pixels below the top clears the sticky nav; 2400x1260 is the
  // 1200x630 share card at the capture's 2x scale.
  const png = await shoot(url, 1200, 760)
  const out = path.join(WEB, 'public/og.png')
  await sharp(png)
    .extract({ left: 0, top: 288, width: 2400, height: 1260 })
    .resize(1200, 630)
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(out)
  console.log('og: og.png', kb(out))
}

const mode = process.argv[2] ?? 'all'
const url = process.argv[3] ?? 'http://localhost:3000/'
if (mode === 'shots' || mode === 'all') await buildShots()
if (mode === 'og' || mode === 'all') await buildOg(url)
