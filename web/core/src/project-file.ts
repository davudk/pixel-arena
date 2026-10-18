// Reads and writes .pxmap project files: a zip containing
//   meta.json      format version, map id
//   history.json   every branch with its transactions and undo/redo stacks
//   snapshot.json  document state at the head of the current branch, so opening is fast
// JSON uses the Godot-compatible encoding (see codec.ts), so files from the Godot build open
// here. This module works on bytes; reading/writing files is up to the host (Electron fs,
// browser download / File System Access).

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { int, parse, stringify } from './codec'
import { FORMAT_VERSION, MapDocument } from './map-document'
import { MapSession } from './map-session'
import type { Value } from './values'

export const EXTENSION = 'pxmap'

export function saveProject(session: MapSession): Uint8Array {
  const meta = {
    app: 'pixel-arena',
    format_version: int(FORMAT_VERSION),
    map_id: session.doc.mapId,
    saved_time: Date.now() / 1000,
  }
  const snapshot = {
    branch: session.currentBranch,
    seq: int(session.branch().txns.length),
    doc: session.doc.toDict(),
  }
  return zipSync({
    'meta.json': strToU8(stringify(meta)),
    'history.json': strToU8(stringify(session.historyToDict())),
    'snapshot.json': strToU8(stringify(snapshot)),
  })
}

export class ProjectError extends Error {}

/** Opens a project as `authorId`. Throws ProjectError if the bytes aren't a usable project. */
export function openProject(bytes: Uint8Array, authorId = 'local'): MapSession {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ProjectError('not a .pxmap (zip) file')
  }
  const read = (name: string): Record<string, Value> | null =>
    files[name] ? (parse(strFromU8(files[name])) as Record<string, Value>) : null
  const meta = read('meta.json')
  const history = read('history.json')
  if (!meta || !history) throw new ProjectError('missing meta.json or history.json')
  if ((meta.format_version as number) > FORMAT_VERSION) throw new ProjectError('saved by a newer version')

  const session = new MapSession(meta.map_id as string, authorId)
  session.loadHistory(history)
  const snapshot = read('snapshot.json')
  if (snapshot && snapshot.branch === session.currentBranch && snapshot.seq === session.branch().txns.length)
    session.doc.loadState(MapDocument.fromDict(snapshot.doc as Record<string, Value>))
  else session.rebuildDocument()
  return session
}
