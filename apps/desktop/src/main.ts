import { app, BrowserWindow, shell, Menu, dialog } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import * as http from 'node:http'

const isDev = !app.isPackaged
const HOSTNAME = '127.0.0.1'

let nextServer: ChildProcess | null = null
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

async function startEmbeddedServer(): Promise<number> {
  const entry = resolveServerEntry()
  if (!existsSync(entry)) {
    throw new Error(
      `Embedded Next server bundle missing at ${entry}. ` +
        `Run "npm --prefix apps/desktop run build:web" first.`
    )
  }

  const port = await findFreePort()

  nextServer = spawn(process.execPath, [entry], {
    cwd: join(entry, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  nextServer.stdout?.on('data', (chunk) => {
    process.stdout.write(`[next] ${chunk}`)
  })
  nextServer.stderr?.on('data', (chunk) => {
    process.stderr.write(`[next] ${chunk}`)
  })
  nextServer.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`Embedded Next server exited unexpectedly (code=${code}, signal=${signal})`)
    }
    nextServer = null
  })

  await waitForServer(port)
  return port
}

function killEmbeddedServer() {
  if (nextServer && !nextServer.killed) {
    nextServer.kill('SIGTERM')
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
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl)
      return { action: 'deny' }
    }
    return { action: 'deny' }
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
