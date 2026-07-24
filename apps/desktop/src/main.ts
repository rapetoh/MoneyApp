import { app, BrowserWindow, shell, Menu, dialog, utilityProcess, type UtilityProcess } from 'electron'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import * as http from 'node:http'

const isDev = !app.isPackaged
const HOSTNAME = '127.0.0.1'

let nextServer: UtilityProcess | null = null
let mainWindow: BrowserWindow | null = null

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

/**
 * Parse a .env-style file (KEY=VALUE lines, # comments, blank lines).
 * No interpolation, no expansion — just the bare format. Strips
 * surrounding quotes when present.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

/**
 * Load the user's .env from `<userData>/.env`. The packaged app is
 * launched from Finder with a clean GUI environment that does not
 * inherit the user's shell vars, so the embedded Next server cannot
 * see OPENAI_API_KEY etc. unless we plant them here.
 *
 * On macOS this resolves to:
 *   ~/Library/Application Support/Murmur/.env
 *
 * Returns the merged env (process.env + file overrides). If the file
 * is missing, returns process.env unchanged so a developer running
 * `npm run dev` (which inherits the shell env) still works.
 */
function loadEnvFile(): NodeJS.ProcessEnv {
  const userDataEnv = join(app.getPath('userData'), '.env')
  if (!existsSync(userDataEnv)) return { ...process.env }
  try {
    const parsed = parseEnvFile(readFileSync(userDataEnv, 'utf8'))
    console.log(`[murmur] loaded env from ${userDataEnv} (${Object.keys(parsed).length} keys)`)
    return { ...process.env, ...parsed }
  } catch (err) {
    console.error(`[murmur] failed to read ${userDataEnv}`, err)
    return { ...process.env }
  }
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
  const envFromFile = loadEnvFile()

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
      ...envFromFile,
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

function killEmbeddedServer() {
  if (nextServer) {
    nextServer.kill()
    nextServer = null
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
    const port = await startEmbeddedServer()
    createWindow(`http://${HOSTNAME}:${port}/`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Murmur failed to start', message)
    app.quit()
  }
}

app.whenReady().then(() => {
  bootstrap()
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(buildAppMenu())
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap()
    }
  })
})

app.on('window-all-closed', () => {
  killEmbeddedServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killEmbeddedServer()
})

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
