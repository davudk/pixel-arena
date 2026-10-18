// Pixel Arena desktop shell (Electron main process).
//
// Serves the built web app over a custom app:// scheme (so absolute URLs like /packs/... work
// exactly as on the dev server), gives the page native file open/save through preload.cjs, and
// starts Steam when it's running. Steam is optional: without it the editor works the same.
//
// Flags: --dev loads the Vite dev server (npm run dev in web/) instead of the build;
// --selftest=<name> opens the app with ?selftest=<name>, enables the test-only IPC and
// POST /__save (results land in web/app/shots/, or <userData>/shots when packaged) and quits
// when the test reports; --steam-app-id=<id> overrides the Steam app id.

const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const DEV = process.argv.includes('--dev')
const SELFTEST = arg('selftest')
// 480 is Valve's public test app (Spacewar); replace with our app id once we have one.
const STEAM_APP_ID = Number(arg('steam-app-id') ?? 480)
const HOST = 'app://pixel-arena'

// Where things live: next to this file in the repo, or in Resources/ when packaged.
const RES = app.isPackaged ? process.resourcesPath : null
const DIRS = {
  web: RES ? path.join(RES, 'web') : path.resolve(__dirname, '../app/dist'),
  packs: RES ? path.join(RES, 'packs') : path.resolve(__dirname, '../../packs'),
  fixtures: RES ? path.join(RES, 'fixtures') : path.resolve(__dirname, '../app/fixtures'),
  shots: RES ? path.join(app.getPath('userData'), 'shots') : path.resolve(__dirname, '../app/shots'),
}

// --- Steam ------------------------------------------------------------------------------

const steam = { client: null, error: null }
try {
  const steamworks = require('steamworks.js')
  steam.client = steamworks.init(STEAM_APP_ID)
  // The overlay needs these Chromium switches, so it has to happen before the app is ready.
  steamworks.electronEnableSteamOverlay()
} catch (e) {
  steam.error = e instanceof Error ? e.message : String(e)
}

function steamStatus() {
  if (!steam.client) return { ok: false, appId: STEAM_APP_ID, error: steam.error ?? 'not started' }
  const c = steam.client
  return {
    ok: true,
    appId: STEAM_APP_ID,
    name: c.localplayer.getName(),
    steamId: String(c.localplayer.getSteamId().steamId64),
    language: c.apps.currentGameLanguage(),
  }
}

// --- app:// -------------------------------------------------------------------------------

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

/** The packs directory listing the library loads first (browsers can't list directories). */
function packIndex() {
  const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [])
  return fs.readdirSync(DIRS.packs, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => ({ dir: d.name, props: list(path.join(DIRS.packs, d.name, 'props')), kits: list(path.join(DIRS.packs, d.name, 'kits')) }))
}

/** `rel` inside `dir`, or null if it escapes it or doesn't exist. */
function inside(dir, rel) {
  const file = path.join(dir, rel)
  if (file !== dir && !file.startsWith(dir + path.sep)) return null
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
}

async function handleApp(request) {
  const url = new URL(request.url)
  const p = decodeURIComponent(url.pathname)
  if (p === '/packs/index.json') return Response.json(packIndex())
  if (p === '/__save' && request.method === 'POST' && SELFTEST) {
    const name = path.basename(url.searchParams.get('name') ?? 'shot.png')
    const body = await request.text()
    fs.mkdirSync(DIRS.shots, { recursive: true })
    fs.writeFileSync(path.join(DIRS.shots, name), Buffer.from(body.replace(/^data:[^,]*;base64,/, ''), 'base64'))
    return new Response('ok')
  }
  let file = null
  if (p.startsWith('/packs/')) file = inside(DIRS.packs, p.slice('/packs/'.length))
  else if (p.startsWith('/fixtures/')) file = inside(DIRS.fixtures, p.slice('/fixtures/'.length))
  else file = inside(DIRS.web, p === '/' ? 'index.html' : p.slice(1))
  if (!file) return new Response('Not found', { status: 404 })
  return net.fetch(pathToFileURL(file).toString())
}

// --- Files ----------------------------------------------------------------------------------

// The page can only read or write paths the user picked in a dialog (or, in a self-test, temp
// files), so a compromised page can't touch arbitrary files.
const granted = new Set()
const FILTERS = [{ name: 'Pixel Arena map', extensions: ['pxmap'] }]
let lastDir = app.getPath('documents')

function fileResult(file) {
  granted.add(file)
  lastDir = path.dirname(file)
  return { path: file, name: path.basename(file) }
}

function writeAtomic(file, bytes) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, Buffer.from(bytes))
  fs.renameSync(tmp, file)
}

ipcMain.handle('file:open', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: lastDir, filters: FILTERS, properties: ['openFile'] })
  if (r.canceled || !r.filePaths[0]) return null
  const file = r.filePaths[0]
  return { ...fileResult(file), bytes: new Uint8Array(fs.readFileSync(file)) }
})

ipcMain.handle('file:read', (_e, file) => {
  if (!granted.has(file)) throw new Error('Not allowed')
  return { ...fileResult(file), bytes: new Uint8Array(fs.readFileSync(file)) }
})

ipcMain.handle('file:save', (_e, file, bytes) => {
  if (!granted.has(file)) throw new Error('Not allowed')
  writeAtomic(file, bytes)
  return fileResult(file)
})

ipcMain.handle('file:saveAs', async (e, suggested, bytes) => {
  const name = suggested.endsWith('.pxmap') ? suggested : `${suggested}.pxmap`
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: path.join(lastDir, name), filters: FILTERS })
  if (r.canceled || !r.filePath) return null
  writeAtomic(r.filePath, bytes)
  return fileResult(r.filePath)
})

/** Title bar state from the page: map name, file path, unsaved changes. */
const docState = new WeakMap()
ipcMain.on('doc:state', (e, s) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  docState.set(win, s)
  if (process.platform === 'darwin') {
    win.setRepresentedFilename(s.path ?? '')
    win.setDocumentEdited(!!s.dirty)
  }
})

ipcMain.handle('steam:status', () => steamStatus())
ipcMain.handle('steam:overlay', (_e, dialogName) => {
  if (!steam.client) return false
  const dialogs = { friends: 0, community: 1, players: 2, settings: 3, achievements: 6 }
  steam.client.overlay.activateDialog(dialogs[dialogName] ?? 0)
  return true
})

if (SELFTEST) {
  ipcMain.handle('test:tempFile', (_e, name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-arena-'))
    const file = path.join(dir, path.basename(name))
    granted.add(file)
    return file
  })
  ipcMain.on('test:done', (_e, ok) => {
    console.log(`selftest ${SELFTEST}: ${ok ? 'PASS' : 'FAIL'}`)
    app.exit(ok ? 0 : 1)
  })
}

// --- Window and menu ------------------------------------------------------------------------

function send(cmd) {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', cmd)
}

function buildMenu() {
  const mac = process.platform === 'darwin'
  const item = (label, accelerator, cmd) => ({ label, accelerator, click: () => send(cmd) })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        item('New Map', 'CmdOrCtrl+N', 'new'),
        item('Open…', 'CmdOrCtrl+O', 'open'),
        { type: 'separator' },
        item('Save', 'CmdOrCtrl+S', 'save'),
        item('Save As…', 'CmdOrCtrl+Shift+S', 'saveAs'),
        { type: 'separator' },
        item('Export Image…', 'CmdOrCtrl+E', 'export'),
        ...(mac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    // Undo/redo are the editor's own (the page handles Cmd+Z); this menu is for text fields.
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }, ...(DEV || !app.isPackaged ? [{ role: 'reload' }, { role: 'toggleDevTools' }] : [])],
    },
    { role: 'windowMenu' },
  ]))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#14121c',
    title: 'Pixel Arena',
    show: !SELFTEST || process.argv.includes('--show'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
      additionalArguments: SELFTEST ? ['--pixel-arena-selftest'] : [],
    },
  })
  // Links open in the system browser, never inside the editor.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(HOST) && !url.startsWith('http://localhost:5200')) e.preventDefault()
  })
  win.on('close', (e) => {
    if (SELFTEST || !docState.get(win)?.dirty) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Discard Changes', 'Cancel'], defaultId: 1, cancelId: 1,
      message: `“${docState.get(win).name}” has unsaved changes.`, detail: 'Quit without saving?',
    })
    if (choice !== 0) e.preventDefault()
  })
  const query = SELFTEST ? `?selftest=${encodeURIComponent(SELFTEST)}` : ''
  win.loadURL(DEV ? `http://localhost:5200/${query}` : `${HOST}/index.html${query}`)
  if (SELFTEST) win.webContents.on('console-message', (e) => console.log(`[page] ${e.message}`))
  return win
}

app.whenReady().then(() => {
  protocol.handle('app', handleApp)
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
