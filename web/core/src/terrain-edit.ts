// World-space terrain helpers that turn edits into terrain ops.
// Height samples sit on integer world (x, z) coordinates. A sample on a chunk border exists in
// every chunk touching it (up to 4) and all copies are written, so chunk edges stay seamless.
// Material cells are addressed by the world coordinate of their minimum corner.

import type { MapDocument } from './map-document'
import { terrain, type TerrainOp } from './ops'
import { HEIGHT, MATERIAL, SAMPLES, SIZE, type Layer } from './terrain-chunk'
import { posmod, Rect2i, Vec2i, Vec3 } from './values'

const div = (v: number) => Math.floor(v / SIZE)

export function heightAt(doc: MapDocument, sx: number, sz: number): number {
  const chunk = doc.terrain.get(`${div(sx)},${div(sz)}`)
  return chunk ? chunk.heights[posmod(sz, SIZE) * SAMPLES + posmod(sx, SIZE)] : 0
}

export function materialAt(doc: MapDocument, cx: number, cz: number): number {
  const chunk = doc.terrain.get(`${div(cx)},${div(cz)}`)
  return chunk ? chunk.materials[posmod(cz, SIZE) * SIZE + posmod(cx, SIZE)] : 0
}

/** Terrain height at any world (x, z), bilinearly interpolated between samples. */
export function heightAtWorld(doc: MapDocument, x: number, z: number): number {
  const sx = Math.floor(x)
  const sz = Math.floor(z)
  const fx = x - sx
  const fz = z - sz
  const h00 = heightAt(doc, sx, sz)
  const h10 = heightAt(doc, sx + 1, sz)
  const h01 = heightAt(doc, sx, sz + 1)
  const h11 = heightAt(doc, sx + 1, sz + 1)
  return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz
}

/** Where a ray first meets the terrain surface, or null. Marches through the map's height band
 *  in ~0.25 m horizontal steps, then refines by bisection. */
export function raycast(doc: MapDocument, origin: Vec3, direction: Vec3): Vec3 | null {
  const len = Math.hypot(direction.x, direction.y, direction.z)
  const dir = direction.scale(1 / len)
  const [bandLo, bandHi] = doc.heightRange()
  const lo = bandLo - 0.01
  const hi = bandHi + 0.01
  if (Math.abs(dir.y) < 1e-6) return null
  let t0 = (hi - origin.y) / dir.y
  let t1 = (lo - origin.y) / dir.y
  if (t0 > t1) [t0, t1] = [t1, t0]
  t0 = Math.max(t0, 0)
  if (t1 < 0) return null
  const horizontal = Math.hypot(dir.x, dir.z)
  let dt = Math.min(0.25 / Math.max(horizontal, 1e-4), t1 - t0)
  dt = Math.max(dt, (t1 - t0) / 4000)
  const at = (t: number) => origin.add(dir.scale(t))
  const above = (p: Vec3) => p.y - heightAtWorld(doc, p.x, p.z) > 0
  let prev = t0
  let t = t0
  while (dt > 0 && t < t1) {
    t = Math.min(t + dt, t1)
    if (!above(at(t))) {
      let a = prev
      let b = t
      for (let i = 0; i < 14; i++) {
        const m = (a + b) / 2
        if (above(at(m))) a = m
        else b = m
      }
      const p = at(b)
      return new Vec3(p.x, heightAtWorld(doc, p.x, p.z), p.z)
    }
    prev = t
  }
  const end = at(t1)
  return new Vec3(end.x, heightAtWorld(doc, end.x, end.z), end.z)
}

/** Ops setting heights for world samples in `rect` (end exclusive). `fn(sx, sz, old)` returns
 *  each sample's new height. */
export function heightOps(doc: MapDocument, rect: Rect2i, fn: (sx: number, sz: number, old: number) => number): TerrainOp[] {
  const values = new Map<string, number>()
  for (let sz = rect.y; sz < rect.endY; sz++)
    for (let sx = rect.x; sx < rect.endX; sx++) {
      const old = heightAt(doc, sx, sz)
      const h = fn(sx, sz, old)
      if (h !== old) values.set(`${sx},${sz}`, h)
    }
  return setOps(doc, HEIGHT, values)
}

/** Ops setting material indices for world cells in `rect` (end exclusive). */
export function materialOps(doc: MapDocument, rect: Rect2i, fn: (cx: number, cz: number, old: number) => number): TerrainOp[] {
  const values = new Map<string, number>()
  for (let cz = rect.y; cz < rect.endY; cz++)
    for (let cx = rect.x; cx < rect.endX; cx++) {
      const old = materialAt(doc, cx, cz)
      const m = fn(cx, cz, old)
      if (m !== old) values.set(`${cx},${cz}`, m)
    }
  return setOps(doc, MATERIAL, values)
}

/** Ops writing explicit values: `values` maps world sample (height) or cell (material) keys
 *  ("x,z") to new values. One op per affected chunk. */
export function setOps(doc: MapDocument, layer: Layer, values: Map<string, number>): TerrainOp[] {
  const perChunk = new Map<string, Map<string, number>>() // chunk key -> local key -> value
  for (const [k, v] of values) {
    const p = Vec2i.fromKey(k)
    const chunks = layer === HEIGHT ? chunksWithSample(p.x, p.y) : [new Vec2i(div(p.x), div(p.y))]
    for (const c of chunks) {
      if (!perChunk.has(c.key)) perChunk.set(c.key, new Map())
      perChunk.get(c.key)!.set(p.sub(c.scale(SIZE)).key, v)
    }
  }
  const ops: TerrainOp[] = []
  for (const [ck, cells] of perChunk) {
    const c = Vec2i.fromKey(ck)
    let lo = new Vec2i(Infinity, Infinity)
    let hi = new Vec2i(-Infinity, -Infinity)
    for (const lk of cells.keys()) {
      const p = Vec2i.fromKey(lk)
      lo = lo.min(p)
      hi = hi.max(p)
    }
    const rect = new Rect2i(lo.x, lo.y, hi.x - lo.x + 1, hi.y - lo.y + 1)
    const vals = doc.readTerrain(c, layer, rect)
    for (const [lk, v] of cells) {
      const p = Vec2i.fromKey(lk)
      vals[(p.y - lo.y) * rect.w + (p.x - lo.x)] = v
    }
    ops.push(terrain(c, layer, rect, vals))
  }
  return ops
}

function chunksWithSample(sx: number, sz: number): Vec2i[] {
  const xs = [div(sx)]
  if (posmod(sx, SIZE) === 0) xs.push(div(sx) - 1)
  const zs = [div(sz)]
  if (posmod(sz, SIZE) === 0) zs.push(div(sz) - 1)
  return xs.flatMap((x) => zs.map((z) => new Vec2i(x, z)))
}
