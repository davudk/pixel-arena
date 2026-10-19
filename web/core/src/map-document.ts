// Source-of-truth map state: objects keyed by UUID plus sparse terrain chunks. Pure data, no
// rendering. Changes only through applyOp(); views listen to `changed` (one primitive op was
// applied) and `reset` (the whole state was replaced).

import { MapObject } from './map-object'
import type { Op } from './ops'
import { Signal, uuid } from './signal'
import { SIZE, TerrainChunk, type Layer, type LayerValues } from './terrain-chunk'
import { copy, Vec2i, Vec3, type Rect2i, type Value } from './values'

export const FORMAT_VERSION = 1
/** Reserved object holding map-level defaults (view settings, ...). Edited through ops like any
 *  other object, so settings changes are undoable and mergeable. */
export const SETTINGS_ID = '@settings'
export const CHUNK_SIZE = SIZE

/** Where problems with invalid ops are reported (tests may silence it). */
export const log = { error: (message: string) => console.error(message) }

export class MapDocument {
  readonly changed = new Signal<Op>()
  readonly reset = new Signal<void>()
  mapId: string
  objects = new Map<string, MapObject>()
  /** Keyed by chunk coordinate key ("x,y"). */
  terrain = new Map<string, TerrainChunk>()

  // Derived spatial index, never persisted: chunk key -> ids of live positioned objects.
  private chunkObjects = new Map<string, Set<string>>()
  private objectChunk = new Map<string, string>()

  constructor(mapId = '') {
    this.mapId = mapId || uuid()
    this.objects.set(SETTINGS_ID, new MapObject(SETTINGS_ID, 'settings'))
  }

  static chunkOf(p: Vec3): Vec2i {
    return new Vec2i(Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE))
  }

  // --- Queries ---------------------------------------------------------------------------

  /** True if the object exists and is not deleted. */
  hasObject(id: string): boolean {
    const o = this.objects.get(id)
    return !!o && !o.deleted
  }

  /** The object even if deleted (check `deleted`), or undefined. */
  getObject(id: string): MapObject | undefined {
    return this.objects.get(id)
  }

  getProp(id: string, path: string, fallback: Value = null): Value {
    const o = this.objects.get(id)
    return o && o.props.has(path) ? o.props.get(path)! : fallback
  }

  getSetting(path: string, fallback: Value = null): Value {
    return this.getProp(SETTINGS_ID, path, fallback)
  }

  getChunk(coord: Vec2i): TerrainChunk | undefined {
    return this.terrain.get(coord.key)
  }

  /** Terrain values in a chunk-local rect; default values if the chunk isn't stored. */
  readTerrain(coord: Vec2i, layer: Layer, rect: Rect2i): LayerValues {
    const chunk = this.terrain.get(coord.key)
    return chunk ? chunk.read(layer, rect) : TerrainChunk.defaultValues(layer, rect.area)
  }

  /** [min, max] terrain height over the whole map; implicit terrain counts as 0. */
  heightRange(): [number, number] {
    let lo = 0
    let hi = 0
    for (const c of this.terrain.values()) {
      lo = Math.min(lo, c.minHeight)
      hi = Math.max(hi, c.maxHeight)
    }
    return [lo, hi]
  }

  objectsInChunk(coord: Vec2i): string[] {
    return [...(this.chunkObjects.get(coord.key) ?? [])]
  }

  /** Every chunk with content (objects or edited terrain). Empty space costs nothing. */
  occupiedChunks(): Vec2i[] {
    const keys = new Set([...this.chunkObjects.keys(), ...this.terrain.keys()])
    return [...keys].map(Vec2i.fromKey)
  }

  // --- Mutation --------------------------------------------------------------------------

  /** Applies one primitive op. Returns a copy with `prev` filled in for set/terrain, or null
   *  if the op was invalid. */
  applyOp(op: Op): Op | null {
    const applied: Op = { ...op }
    switch (op.op) {
      case 'create':
      {
        if (this.objects.has(op.id)) return this.invalid(op, 'object already exists')
        const obj = new MapObject(op.id, op.type)
        this.objects.set(op.id, obj)
        for (const [path, value] of Object.entries(op.props ?? {})) if (value !== null && value !== undefined) obj.props.set(path, copy(value))
        if (obj.props.has('position')) this.reindex(obj)
        break
      }
      case 'delete': {
        const obj = this.objects.get(op.id)
        if (!obj || obj.deleted || op.id === SETTINGS_ID) return this.invalid(op, 'no live object to delete')
        obj.deleted = true
        this.reindex(obj)
        break
      }
      case 'restore': {
        const obj = this.objects.get(op.id)
        if (!obj || !obj.deleted) return this.invalid(op, 'no deleted object to restore')
        obj.deleted = false
        this.reindex(obj)
        break
      }
      case 'set': {
        const obj = this.objects.get(op.id)
        if (!obj) return this.invalid(op, 'no such object')
        ;(applied as typeof op).prev = obj.props.has(op.path) ? obj.props.get(op.path)! : null
        if (op.value === null || op.value === undefined) obj.props.delete(op.path)
        else obj.props.set(op.path, copy(op.value))
        if (op.path === 'position') this.reindex(obj)
        break
      }
      case 'terrain': {
        if (!TerrainChunk.isValidRect(op.layer, op.rect) || op.values.length !== op.rect.area)
          return this.invalid(op, 'bad terrain rect')
        const chunk = this.terrain.get(op.chunk.key) ?? new TerrainChunk(op.chunk)
        ;(applied as typeof op).prev = chunk.write(op.layer, op.rect, op.values)
        if (chunk.isDefault()) this.terrain.delete(op.chunk.key)
        else this.terrain.set(op.chunk.key, chunk)
        break
      }
      default:
        return this.invalid(op, 'unknown op')
    }
    this.changed.emit(applied)
    return applied
  }

  /** Takes over another document's state (it must not be used afterwards). Emits `reset`. */
  loadState(other: MapDocument): void {
    this.mapId = other.mapId
    this.objects = other.objects
    this.terrain = other.terrain
    this.rebuildIndex()
    this.reset.emit()
  }

  toDict(): Record<string, Value> {
    return {
      map_id: this.mapId,
      objects: [...this.objects.values()].map((o) => o.toDict()),
      terrain: [...this.terrain.values()].map((c) => c.toDict()),
    }
  }

  static fromDict(d: Record<string, Value>): MapDocument {
    const doc = new MapDocument(d.map_id as string)
    for (const od of d.objects as Record<string, Value>[]) {
      const obj = MapObject.fromDict(od)
      doc.objects.set(obj.id, obj)
    }
    for (const cd of d.terrain as Record<string, Value>[]) {
      const chunk = TerrainChunk.fromDict(cd)
      doc.terrain.set(chunk.coord.key, chunk)
    }
    doc.rebuildIndex()
    return doc
  }

  private invalid(op: Op, reason: string): null {
    log.error(`MapDocument.applyOp: ${reason}: ${JSON.stringify(op)}`)
    return null
  }

  private rebuildIndex(): void {
    this.chunkObjects.clear()
    this.objectChunk.clear()
    for (const obj of this.objects.values()) this.reindex(obj)
  }

  private reindex(obj: MapObject): void {
    const pos = obj.props.get('position')
    const indexed = !obj.deleted && pos instanceof Vec3
    const next = indexed ? MapDocument.chunkOf(pos).key : null
    const old = this.objectChunk.get(obj.id)
    if (old !== undefined) {
      if (old === next) return
      const members = this.chunkObjects.get(old)!
      members.delete(obj.id)
      if (members.size === 0) this.chunkObjects.delete(old)
      this.objectChunk.delete(obj.id)
    }
    if (next !== null) {
      if (!this.chunkObjects.has(next)) this.chunkObjects.set(next, new Set())
      this.chunkObjects.get(next)!.add(obj.id)
      this.objectChunk.set(obj.id, next)
    }
  }
}

/** `ids` plus everything parented to them, recursively (things sitting on them). */
export function withDescendants(doc: MapDocument, roots: string[]): string[] {
  const out = new Set(roots)
  let grew = true
  while (grew) {
    grew = false
    for (const obj of doc.objects.values()) {
      if (obj.deleted || out.has(obj.id)) continue
      const parent = obj.props.get('parent')
      if (typeof parent === 'string' && out.has(parent)) {
        out.add(obj.id)
        grew = true
      }
    }
  }
  return [...out]
}
