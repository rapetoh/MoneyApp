import { app, BrowserWindow, shell, Menu, dialog, utilityProcess, type UtilityProcess } from 'electron'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import * as http from 'node:http'
import * as https from 'node:https'

const isDev = !app.isPackaged
const HOSTNAME = '127.0.0.1'

/**
 * The hosted deployment that serves /api/ai/*. The desktop shell never
 * runs the AI routes locally — OPENAI_API_KEY and the Supabase secrets
 * stay on the server, exactly as mobile does via
 * EXPO_PUBLIC_API_BASE_URL. This replaced the `<userData>/.env` loader,
 * whose only working configuration put SUPABASE_SERVICE_ROLE_KEY in a
 * plaintext file on the end user's machine.
 */
const HOSTED_API_ORIGIN = 'https://money-app-web-w6su.vercel.app'
const HOSTED_API_PREFIX = '/api/ai/'

let nextServer: UtilityProcess | null = null
let gatewayServer: http.Server | null = null
let mainWindow: BrowserWindow | null = null

/**
 * The one origin the app shell is ever allowed to navigate to in-place —
 * `http://127.0.0.1:<gatewayPort>`, set once `startGateway()` resolves,
 * before any window is created. `will-navigate` guards below compare
 * against this rather than a hard-coded port, since the port is chosen
 * freshly (`findFreePort()`) on every launch.
 */
let appOrigin: string | null = null

function isAllowedNavigation(targetUrl: string): boolean {
  if (!appOrigin) return false
  try {
    return new URL(targetUrl).origin === appOrigin
  } catch {
    return false
  }
}

/**
 * Blocks a same-frame navigation away from the app shell — the gap
 * `setWindowOpenHandler` below doesn't cover, because that only fires
 * for `window.open`-style new-window requests. A same-frame navigation
 * (a link, a redirect, injected JS setting `location.href`) can replace
 * the *existing* window's content with a remote page in place, while
 * the renderer still holds the user's live Supabase session and the
 * gateway's proxy to the hosted AI routes — the app shell would keep
 * its title and window chrome while actually showing an attacker's page
 * (fix-plan 4.5 / audit 07-F33). In-app navigation (anywhere under the
 * local gateway origin — the embedded Next app's own pages) is left
 * alone; everything else is denied, with real http(s) URLs handed off
 * to the OS browser instead of silently dropped, matching
 * `setWindowOpenHandler`'s existing external-link policy.
 *
 * Registered once via `app.on('web-contents-created')` — which fires for
 * the main window's own `webContents` *and* every child window
 * `setWindowOpenHandler` allows (e.g. the export-to-PDF preview) — so
 * there is one navigation policy for the whole app, not just the window
 * created first.
 */
function guardNavigation(contents: Electron.WebContents): void {
  contents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedNavigation(targetUrl)) return
    event.preventDefault()
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      shell.openExternal(targetUrl)
    }
  })
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, HOSTNAME, () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('Could not get free port')))
      }
    })
  })
}

function probe(port: number, path = '/'): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOSTNAME, port, path, timeout: 1500 },
      (res) => {
        res.resume()
        resolve(true)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe(port)) return
    await delay(250)
  }
  throw new Error(`Embedded Next server did not respond on port ${port} within ${timeoutMs}ms`)
}

function resolveServerEntry(): string {
  if (isDev) {
    return join(__dirname, '../../web/.next/standalone/apps/web/server.js')
  }
  return join(process.resourcesPath, 'web/apps/web/server.js')
}

// Hop-by-hop headers are connection-scoped and must not be forwarded
// (RFC 9110 §7.6.1). `host` is recomputed for each target.
const NON_FORWARDED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
])

function forwardableHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !NON_FORWARDED_HEADERS.has(name)) out[name] = value
  }
  return out
}

function proxyTo(
  target: { transport: typeof http | typeof https; hostname: string; port: number },
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const upstream = target.transport.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: forwardableHeaders(req.headers),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, forwardableHeaders(upstreamRes.headers))
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    // Path only — the query string can carry auth codes (/auth/callback?code=…).
    console.error(`[murmur] proxy error for ${req.method} ${req.url?.split('?')[0]}`, err)
    if (res.headersSent) {
      res.destroy()
    } else {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Upstream unavailable' }))
    }
  })
  // Renderer cancelled (or finished) — stop the upstream request too.
  res.on('close', () => upstream.destroy())
  req.pipe(upstream)
}

/**
 * One local origin for the renderer. UI traffic is piped to the
 * embedded Next server; /api/ai/* is forwarded to the hosted
 * deployment, so no server secret ever exists on the user's machine.
 */
async function startGateway(nextPort: number): Promise<number> {
  const port = await findFreePort()
  const hosted = new URL(HOSTED_API_ORIGIN)
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith(HOSTED_API_PREFIX)) {
      proxyTo({ transport: https, hostname: hosted.hostname, port: 443 }, req, res)
    } else {
      proxyTo({ transport: http, hostname: HOSTNAME, port: nextPort }, req, res)
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOSTNAME, () => resolve())
  })
  gatewayServer = server
  return port
}

async function startEmbeddedServer(): Promise<number> {
  const entry = resolveServerEntry()
  if (!existsSync(entry)) {
    throw new Error(
      `Embedded Next server bundle missing at ${entry}. ` +
        `Run "npm --prefix apps/desktop run build:web" first.`
    )
  }

  const port = await findFreePort()

  // utilityProcess.fork is Electron's purpose-built API for running
  // Node code as a managed child of the main process. Critically, it
  // does NOT re-launch the Electron binary as a child, so macOS
  // LaunchServices does not register a second app instance and no
  // stray Terminal-looking window pops up at launch (which was the
  // failure mode of `child_process.spawn(process.execPath, ...,
  // ELECTRON_RUN_AS_NODE: '1')`).
  nextServer = utilityProcess.fork(entry, [], {
    cwd: join(entry, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME,
    },
    stdio: 'pipe',
    serviceName: 'murmur-next-server',
  })

  nextServer.stdout?.on('data', (chunk) => {
    process.stdout.write(`[next] ${chunk}`)
  })
  nextServer.stderr?.on('data', (chunk) => {
    process.stderr.write(`[next] ${chunk}`)
  })
  nextServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Embedded Next server exited unexpectedly (code=${code})`)
    }
    nextServer = null
  })

  await waitForServer(port)
  return port
}

function stopServers() {
  if (nextServer) {
    nextServer.kill()
    nextServer = null
  }
  if (gatewayServer) {
    gatewayServer.close()
    gatewayServer = null
  }
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F4F1EA',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    // External http(s) URLs hand off to the OS browser — never load
    // them inside the app shell (avoids navigating away from the
    // embedded Next server and keeps OAuth-style flows in Safari /
    // Chrome where the user expects them).
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl)
      return { action: 'deny' }
    }
    // Same-origin / about:blank popups are how the web app opens its
    // own print-to-PDF preview from /dashboard/export. Returning
    // 'deny' here (the prior default) made `window.open` return null
    // and the Plus export silently broke in the packaged build.
    // Allow these — they run in a child BrowserWindow with the same
    // sandboxed webPreferences as the main window.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      },
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadURL(url)
}

async function bootstrap() {
  app.setName('Murmur')

  try {
    const nextPort = await startEmbeddedServer()
    const gatewayPort = await startGateway(nextPort)
    appOrigin = `http://${HOSTNAME}:${gatewayPort}`
    createWindow(`${appOrigin}/`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Murmur failed to start', message)
    app.quit()
  }
}

// Two live instances share one Chromium profile (userData); the loser
// of the profile lock renders without its preload bridge, so the web
// app misses `window.murmur` and drops the whole desktop layout —
// looks like every desktop fix regressed at once. One instance only:
// a second launch just focuses the existing window.
const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// One navigation policy for every window this app ever creates — the
// main window and any child `setWindowOpenHandler` allows (fix-plan
// 4.5). Registered at module scope, before `whenReady()`, so it is in
// place for the very first `webContents` Electron creates.
app.on('web-contents-created', (_event, contents) => {
  guardNavigation(contents)
})

app.whenReady().then(() => {
  if (!hasInstanceLock) return
  bootstrap()
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(buildAppMenu())
  }
  startAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap()
    }
  })
})

app.on('window-all-closed', () => {
  stopServers()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopServers()
})

/**
 * Auto-update (Aug 29, 2026 — public desktop distribution). Checks the
 * GitHub releases feed (publish config in electron-builder.yml) on
 * launch and every 4 hours; downloads in the background; installs on
 * quit. On the first update found we tell the user once, quietly, via
 * dialog, rather than interrupting with progress UI. Signed builds only:
 * electron-updater refuses unsigned updates on macOS, which is exactly
 * right. Errors are logged and swallowed — an offline launch or a rate-
 * limited feed must never affect the app.
 */
function startAutoUpdater(): void {
  if (!app.isPackaged) return
  // Lazy import keeps dev launches (electron .) free of the dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  let notified = false
  autoUpdater.on('update-downloaded', (info) => {
    if (notified) return
    notified = true
    const win = BrowserWindow.getAllWindows()[0]
    const message = `Murmur ${info.version} is ready. It installs the next time you quit the app.`
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        message: 'Update ready',
        detail: message,
        buttons: ['OK', 'Restart now'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 1) autoUpdater.quitAndInstall()
      }).catch(() => undefined)
    }
  })
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err?.message ?? err)
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, 4 * 60 * 60 * 1000)
}

function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: 'Murmur',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ]
  return Menu.buildFromTemplate(template)
}
