// What the page can do beyond a plain browser. In the desktop build (web/desktop) the preload
// script exposes `window.pixelArenaDesktop`: native open/save dialogs, the title bar's document
// state, menu commands and Steam. In a browser it's absent and the app falls back to file
// inputs and downloads.

export interface FileRef {
  path: string
  name: string
}

export interface SteamStatus {
  ok: boolean
  appId: number
  name?: string
  steamId?: string
  language?: string
  error?: string
}

export type MenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'export' | 'grid'

export interface DesktopApi {
  platform: string
  openFile(): Promise<(FileRef & { bytes: Uint8Array }) | null>
  readFile(path: string): Promise<FileRef & { bytes: Uint8Array }>
  saveFile(path: string, bytes: Uint8Array): Promise<FileRef>
  saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<FileRef | null>
  setDocument(state: { name: string; path: string | null; dirty: boolean }): void
  onCommand(cb: (cmd: MenuCommand) => void): () => void
  /** macOS trackpad rotation: degrees since the last call, counter-clockwise positive. */
  onRotate?(cb: (degrees: number) => void): () => void
  steam: {
    status(): Promise<SteamStatus>
    overlay(dialog: 'friends' | 'community' | 'players' | 'settings' | 'achievements'): Promise<boolean>
  }
  /** Only when the desktop app was started with --selftest. */
  test: { tempFile(name: string): Promise<string>; rotate(degrees: number): void; capture(name: string): Promise<void>; done(ok: boolean): void } | null
}

export const desktop: DesktopApi | null = (globalThis as { pixelArenaDesktop?: DesktopApi }).pixelArenaDesktop ?? null
