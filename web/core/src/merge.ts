// Three-way merge of map documents at the granularity of object existence, single properties
// and single terrain cells. Anything changed on only one side merges automatically; the same
// key changed to different values on both sides is a conflict for the user to resolve.

import type { MapDocument } from './map-document'
import type { MapObject } from './map-object'
import { create, del, restore, setProp, type Op } from './ops'
import { HEIGHT, MATERIAL, SIZE, TerrainChunk, type Layer } from './terrain-chunk'
import { setOps } from './terrain-edit'
import { Rect2i, same, Vec2i, type Value } from './values'

/** Keep the target branch's value. */
export const MINE = 'mine'
/** Take the merged-in branch's value. */
export const THEIRS = 'theirs'
export type Resolution = typeof MINE | typeof THEIRS

export type Existence = { type: string; deleted: boolean } | null

export type DiffEntry =
  | { key: string; kind: 'object'; id: string; value: Existence }
  | { key: string; kind: 'prop'; id: string; path: string; value: Value }
  | { key: string; kind: 'terrain'; layer: Layer; cell: Vec2i; value: number }

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type Conflict = Without<DiffEntry, 'value'> & { mine: Value | Existence; theirs: Value | Existence }

export interface MergePlan {
  changes: DiffEntry[]
  conflicts: Conflict[]
}

/** Every key whose value differs between `base` and `head`, with the head value. Keys:
 *  "o|id" (existence), "p|id|path", "t|layer|x,z" (world coordinates, so a border height
 *  sample stored in several chunks is a single entry). */
export function diff(base: MapDocument, head: MapDocument): Map<string, DiffEntry> {
  const out = new Map<string, DiffEntry>()
  const ids = new Set([...base.objects.keys(), ...head.objects.keys()])
  for (const id of ids) {
    const a = base.objects.get(id)
    const b = head.objects.get(id)
    const ea = existence(a)
    const eb = existence(b)
    if (!same(ea, eb)) out.set(`o|${id}`, { key: `o|${id}`, kind: 'object', id, value: eb })
    const pa = a?.props ?? new Map<string, Value>()
    const pb = b?.props ?? new Map<string, Value>()
    for (const path of new Set([...pa.keys(), ...pb.keys()])) {
      const vb = pb.get(path) ?? null
      if (!same(pa.get(path) ?? null, vb)) {
        const key = `p|${id}|${path}`
        out.set(key, { key, kind: 'prop', id, path, value: vb })
      }
    }
  }
  for (const ck of new Set([...base.terrain.keys(), ...head.terrain.keys()])) {
    const c = Vec2i.fromKey(ck)
    for (const layer of [HEIGHT, MATERIAL] as const) {
      const n = TerrainChunk.side(layer)
      const full = new Rect2i(0, 0, n, n)
      const va = base.readTerrain(c, layer, full)
      const vb = head.readTerrain(c, layer, full)
      for (let i = 0; i < va.length; i++) {
        if (va[i] === vb[i]) continue
        const cell = c.scale(SIZE).add(new Vec2i(i % n, Math.floor(i / n)))
        const key = `t|${layer}|${cell.x},${cell.y}`
        out.set(key, { key, kind: 'terrain', layer, cell, value: vb[i] })
      }
    }
  }
  return out
}

/** What merging `source` into `target` (both descended from `base`) would do. */
export function plan(base: MapDocument, target: MapDocument, source: MapDocument): MergePlan {
  const theirs = diff(base, source)
  const mine = diff(base, target)
  const p: MergePlan = { changes: [], conflicts: [] }
  for (const [key, e] of theirs) {
    const m = mine.get(key)
    if (!m) p.changes.push(e)
    else if (!same(m.value as Value, e.value as Value)) {
      const { value, ...rest } = e
      p.conflicts.push({ ...rest, mine: m.value, theirs: value } as Conflict)
    }
  }
  return p
}

/** Ops that apply `p` to `doc` (the target head). `resolutions` maps conflict keys to
 *  MINE / THEIRS; unlisted conflicts use `fallback`. */
export function opsFor(doc: MapDocument, p: MergePlan, resolutions: Record<string, Resolution> = {}, fallback: Resolution = THEIRS): Op[] {
  const picked: DiffEntry[] = [...p.changes]
  for (const c of p.conflicts) {
    if ((resolutions[c.key] ?? fallback) === THEIRS) {
      const { mine: _m, theirs, ...rest } = c
      picked.push({ ...rest, value: theirs } as DiffEntry)
    }
  }
  const ops: Op[] = []
  // Existence first so property sets can target newly created objects.
  for (const e of picked) {
    if (e.kind !== 'object' || e.value === null) continue
    const obj = doc.getObject(e.id)
    if (!obj) {
      ops.push(create(e.id, e.value.type))
      if (e.value.deleted) ops.push(del(e.id))
    } else if (obj.deleted && !e.value.deleted) ops.push(restore(e.id))
    else if (!obj.deleted && e.value.deleted) ops.push(del(e.id))
  }
  for (const e of picked) {
    if (e.kind === 'prop' && !same(doc.getProp(e.id, e.path), e.value)) ops.push(setProp(e.id, e.path, e.value))
  }
  const byLayer = new Map<Layer, Map<string, number>>()
  for (const e of picked) {
    if (e.kind !== 'terrain') continue
    if (!byLayer.has(e.layer)) byLayer.set(e.layer, new Map())
    byLayer.get(e.layer)!.set(e.cell.key, e.value)
  }
  for (const [layer, cells] of byLayer) ops.push(...setOps(doc, layer, cells))
  return ops
}

function existence(obj: MapObject | undefined): Existence {
  return obj ? { type: obj.type, deleted: obj.deleted } : null
}
