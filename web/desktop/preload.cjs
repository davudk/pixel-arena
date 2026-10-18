// Bridge between the page and the main process. The page sees `window.pixelArenaDesktop` (see
// web/app/src/platform.ts for the typed side) and nothing else from Node or Electron.

const { contextBridge, ipcRenderer } = require('electron')

// The main process only adds this flag when it was started with --selftest.
const selftest = process.argv.includes('--pixel-arena-selftest')

contextBridge.exposeInMainWorld('pixelArenaDesktop', {
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFile: (path, bytes) => ipcRenderer.invoke('file:save', path, bytes),
  saveFileAs: (suggestedName, bytes) => ipcRenderer.invoke('file:saveAs', suggestedName, bytes),
  setDocument: (state) => ipcRenderer.send('doc:state', state),
  onCommand: (cb) => {
    const listener = (_e, cmd) => cb(cmd)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  steam: {
    status: () => ipcRenderer.invoke('steam:status'),
    overlay: (dialog) => ipcRenderer.invoke('steam:overlay', dialog),
  },
  test: selftest
    ? {
        tempFile: (name) => ipcRenderer.invoke('test:tempFile', name),
        done: (ok) => ipcRenderer.send('test:done', ok),
      }
    : null,
})
