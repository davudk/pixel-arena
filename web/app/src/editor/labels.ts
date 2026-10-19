// Names for objects and labels for edits, in one place so the history reads consistently:
// a verb, then what it applied to ("Move Tent", "Delete 3 objects", "Paint Dirt").

import type { MapDocument, MapObject } from '@pixel-arena/core'
import type { Library } from '../library/library'
import { PALETTE } from '../render/terrain-shading'
import type { BuildPiece, SculptOp } from './tool-params'
import { liquid } from '../world/liquids'

export function objectName(obj: MapObject, library: Library): string {
  return nameOf(obj.type, (k) => obj.props.get(k), library)
}

/** Name from an object's type and properties (also for copies not on the map yet). A custom
 *  'name' wins (see grouping.ts). */
export function nameOf(type: string, get: (key: string) => unknown, library: Library): string {
  const custom = get('name')
  if (typeof custom === 'string' && custom) return custom
  if (type === 'group') return 'Group'
  if (type === 'prop') {
    const id = String(get('prop'))
    return library.props.get(id)?.name ?? id
  }
  if (type === 'building') return library.kits.get(String(get('kit')))?.name ?? 'Building'
  if (type === 'water') return liquid(get('liquid')).name
  return type
}

/** "<verb> <name>" for one object, "<verb> <n> objects" for several. */
export function objectsLabel(verb: string, ids: string[], doc: MapDocument, library: Library): string {
  if (ids.length === 1) {
    const obj = doc.getObject(ids[0])
    return obj ? `${verb} ${objectName(obj, library)}` : verb
  }
  return `${verb} ${ids.length} objects`
}

const OPS: Record<SculptOp, string> = { raise: 'Raise', lower: 'Lower', smooth: 'Smooth', flatten: 'Flatten' }
export const sculptLabel = (op: SculptOp) => `${OPS[op]} terrain`
export const paintLabel = (material: number) => `Paint ${PALETTE[material]?.name ?? 'terrain'}`
export const placeLabel = (name: string) => `Place ${name}`
/** "Draw water", "Draw lava", "Draw muddy water". */
export const drawLabel = (liquidId: string) => `Draw ${liquid(liquidId).name.toLowerCase()}`

const PIECES: Record<BuildPiece, string> = {
  foundation: 'Build foundation', erase: 'Remove floor', wall: 'Build wall', door: 'Place door', window: 'Place window',
  doorway: 'Place doorway', stairs: 'Place stairs', room: 'Paint room',
}
/** Room types as the editor names them. */
export const ROOM_NAMES: Record<string, string> = {
  none: 'No room', living: 'Living room', bedroom: 'Bedroom', kitchen: 'Kitchen', dining: 'Dining room', bathroom: 'Bathroom',
  hall: 'Hall', office: 'Office', classroom: 'Classroom', shop: 'Shop', storage: 'Storage', ward: 'Ward', reception: 'Reception', garage: 'Garage',
}
export const buildLabel = (piece: BuildPiece) => PIECES[piece]
export const pieceName = (piece: BuildPiece) =>
  ({ foundation: 'Floor', erase: 'Erase', wall: 'Wall', door: 'Door', window: 'Window', doorway: 'Doorway', stairs: 'Stairs', room: 'Room' })[piece]
export const opName = (op: SculptOp) => OPS[op]
