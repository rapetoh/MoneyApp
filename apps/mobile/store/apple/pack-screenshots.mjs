#!/usr/bin/env node
// Build the screenshot bundle (docs/Murmur App Store Screenshots v3
// (Standalone).html) from its editable sources in ./design:
//
//   node apps/mobile/store/apple/pack-screenshots.mjs
//   node apps/mobile/store/apple/render-screenshots.mjs
//
// The Sep 2026 bundle supplies React, Babel, the device frame and the app
// screen components; design/frames.jsx adds the store frames on top, with
// design/photos (Unsplash License, see CREDITS.md) and design/logos (the
// site icons the app itself shows). Fonts:
// Fraunces (design/fonts, OFL), Plus Jakarta Sans and DM Mono (the app's own,
// apps/mobile/assets/fonts, OFL). New York and SF Rounded stay out of the
// repo: the CSS asks for sysfont/<file> and the render script serves them
// from /System/Library/Fonts.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')
const BASE = path.join(REPO, 'docs', 'Murmur App Store Screenshots (Standalone) (1).html')
const OUT = path.join(REPO, 'docs', 'Murmur App Store Screenshots v3 (Standalone).html')
const DESIGN = path.join(HERE, 'design')
const APP_FONTS = path.join(REPO, 'apps', 'mobile', 'assets', 'fonts')

const html = fs.readFileSync(BASE, 'utf8')
const grab = (t) => JSON.parse(html.match(new RegExp(`<script type="__bundler/${t}">([\\s\\S]*?)</script>`))[1].trim())
const manifest = grab('manifest')
const ext = grab('ext_resources')
let tpl = grab('template')

const add = (file, mime) => {
  const uuid = crypto.randomUUID()
  manifest[uuid] = { mime, compressed: true, data: zlib.gzipSync(fs.readFileSync(file), { level: 9 }).toString('base64') }
  return uuid
}
const fontFile = {
  'Fraunces.ttf': path.join(DESIGN, 'fonts', 'Fraunces.ttf'),
  'Fraunces-Italic.ttf': path.join(DESIGN, 'fonts', 'Fraunces-Italic.ttf'),
  'PlusJakartaSans-Regular.ttf': path.join(APP_FONTS, 'PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-SemiBold.ttf': path.join(APP_FONTS, 'PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold.ttf': path.join(APP_FONTS, 'PlusJakartaSans-Bold.ttf'),
  'DMMono-Regular.ttf': path.join(APP_FONTS, 'DMMono-Regular.ttf'),
  'DMMono-Medium.ttf': path.join(APP_FONTS, 'DMMono-Medium.ttf'),
}
const fontId = Object.fromEntries(Object.entries(fontFile).map(([name, file]) => [name, add(file, 'font/ttf')]))
ext.push({ id: 'appIcon', uuid: add(path.join(REPO, 'apps', 'mobile', 'assets', 'icon.png'), 'image/png') })
for (const f of fs.readdirSync(path.join(DESIGN, 'logos')).filter((f) => f.endsWith('.png')))
  ext.push({ id: 'logo:' + f.replace(/\.png$/, ''), uuid: add(path.join(DESIGN, 'logos', f), 'image/png') })
for (const [id, f] of [['voice', 'voice-speaker.jpg'], ['pay', 'applepay-bar.jpg'], ['ask', 'ask-friends.jpg']])
  ext.push({ id: 'photo:' + id, uuid: add(path.join(DESIGN, 'photos', f), 'image/jpeg') })
const jsx = add(path.join(DESIGN, 'frames.jsx'), 'application/javascript')

const css = fs.readFileSync(path.join(DESIGN, 'frames.css'), 'utf8')
  .replace(/url\("fonts\/([^"]+)"\)/g, (m, f) => fontId[f] ? `url("${fontId[f]}")` : `url("sysfont/${f}")`)
tpl = tpl.replace('</style>', css + '\n</style>')
tpl = tpl.replace(/<title>[^<]*<\/title>/, '<title>Murmur App Store Screenshots v3</title>')
const mount = /<script type="text\/babel">\s*function Section[\s\S]*?<\/script>/
if (!mount.test(tpl)) throw new Error('base bundle has no Page mount to replace')
tpl = tpl.replace(mount, `<script type="text/babel" src="${jsx}"></script>\n<script type="text/babel">ReactDOM.createRoot(document.getElementById("root")).render(<V2Page/>);</script>`)

// JSON inside <script> must not contain "</": escape it so the block is not cut short.
let out = html
const put = (t, v) => { out = out.replace(new RegExp(`(<script type="__bundler/${t}">)[\\s\\S]*?(</script>)`), (m, a, b) => a + JSON.stringify(v).replace(/<\//g, '<\\/') + b) }
put('manifest', manifest)
put('ext_resources', ext)
put('template', tpl)
out = out.replace(/<title>[^<]*<\/title>/, '<title>Murmur App Store Screenshots v3</title>')
fs.writeFileSync(OUT, out)
console.log('wrote', path.relative(REPO, OUT), (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB')
