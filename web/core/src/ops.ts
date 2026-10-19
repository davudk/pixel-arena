// Primitive operations: the only way a MapDocument changes. Ops are plain objects so they
// serialize (and later travel over the network) as-is.
//   create  {id, type, props?}         props: the new object's properties (one op instead of a
//                                      create and a set per property; older files have no props)
//   delete  {id}                       tombstone; the object keeps its props
//   restore {id}                       clears the tombstone
//   set     {id, path, value}          a null value removes the property
//   terrain {chunk, layer, rect, values}  rect is chunk-local; values row-major
// When applied, "set" and "terrain" ops also record `prev`, the value(s) they overwrote.

import type { MapDocument } from './map-document'
import type { Layer, LayerValues } from './terrain-chunk'
import { same, type Rect2i, type Value, type Vec2i } from './values'

export interface CreateOp { op: 'create'; id: string; type: string; props?: Record<string, Value> }
export interface DeleteOp { op: 'delete'; id: string }
export interface RestoreOp { op: 'restore'; id: string }
export interface SetOp { op: 'set'; id: string; path: string; value: Value; prev?: Value }
export interface TerrainOp {
  op: 'terrain'; chunk: Vec2i; layer: Layer; rect: Rect2i; values: LayerValues; prev?: LayerValues
}
export type Op = CreateOp | DeleteOp | RestoreOp | SetOp | TerrainOp

export const create = (id: string, type: string, props?: Record<string, Value>): CreateOp =>
  props && Object.keys(props).length ? { op: 'create', id, type, props } : { op: 'create', id, type }
export const del = (id: string): DeleteOp => ({ op: 'delete', id })
export const restore = (id: string): RestoreOp => ({ op: 'restore', id })
export const setProp = (id: string, path: string, value: Value): SetOp => ({ op: 'set', id, path, value })
export const terrain = (chunk: Vec2i, layer: Layer, rect: Rect2i, values: LayerValues): TerrainOp =>
  ({ op: 'terrain', chunk, layer, rect, values })

/**
 * The op that reverts `applied` (an op returned by MapDocument.applyOp) against the document's
 * current state, or null if nothing can be reverted because the data has changed since. This is
 * what makes undo per-author and selective: someone else's later edit to the same property
 * wins, terrain reverts only the cells that still hold the written values, and properties of an
 * object someone else deleted are left alone so a later restore brings back the whole object.
 */
export function inverse(doc: MapDocument, applied: Op): Op | null {
  switch (applied.op) {
    case 'create':
    case 'restore':
      return doc.hasObject(applied.id) ? del(applied.id) : null
    case 'delete': {
      const obj = doc.getObject(applied.id)
      return obj && obj.deleted ? restore(applied.id) : null
    }
    case 'set':
      if (!doc.hasObject(applied.id)) return null
      if (!same(doc.getProp(applied.id, applied.path), applied.value)) return null
      return setProp(applied.id, applied.path, applied.prev ?? null)
    case 'terrain': {
      const current = doc.readTerrain(applied.chunk, applied.layer, applied.rect)
      const out = current.slice()
      let changed = false
      const prev = applied.prev!
      for (let i = 0; i < out.length; i++) {
        if (current[i] === applied.values[i] && current[i] !== prev[i]) {
          out[i] = prev[i]
          changed = true
        }
      }
      return changed ? terrain(applied.chunk, applied.layer, applied.rect, out) : null
    }
  }
}
