// Water bodies as shapes, and the rules for adding and removing water. Bodies never overlap, so
// every spot has at most one liquid:
//   - new water takes the height of the body the stroke started in (any liquid: lava poured into
//     a lake sits at the lake's surface), or on dry ground the lowest ground along the new edge;
//   - it merges with the same liquid where they touch or overlap (one body, one surface);
//   - the same liquid at a clearly different height (more than MERGE_LEVEL apart) isn't merged:
//     the new water is clipped beside it, which makes a small step;
//   - a different liquid is replaced where the new water goes (that body is cut back around it);
//   - erasing cuts water away (the ground is left as it is).
// A body is a water object: position (x, level, z), rotation, `polygon` (outer ring, relative to
// the position) and optional `holes` (rings, relative too). Shape maths uses polygon-clipping in
// world x/z.

import * as clipping from 'polygon-clipping'
import type { MultiPolygon, Ring } from 'polygon-clipping'
import { PackedVec2Array, Rect2i, terrainEdit, Vec2, Vec3, type MapDocument, type MapObject, type MapSession, type Value } from '@pixel-arena/core'

export type { MultiPolygon, Ring }
type TerrainOp = ReturnType<typeof terrainEdit.heightOps>[number]

/** Same liquid within this height (m) merges; further apart it stays separate. */
export const MERGE_LEVEL = 0.25
/** Shapes are rounded to this grid (m), and pieces smaller than MIN_AREA (m²) dropped, so
 *  repeated edits don't leave slivers. */
const GRID = 0.01
const MIN_AREA = 0.05

const round = (v: number) => Math.round(v / GRID) * GRID
// The package's types declare named exports; its ES build only has a default export.
const pc = ((clipping as unknown as { default?: typeof clipping }).default ?? clipping) as typeof clipping

// --- Conversions --------------------------------------------------------------------------

/** A water object's shape in world x/z (outer ring, then holes). */
export function worldShape(obj: MapObject): MultiPolygon {
  const pos = obj.props.get('position') as Vec3
  const yaw = Number(obj.props.get('rotation') ?? 0)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const ring = (p: PackedVec2Array): Ring => p.points.map((q) => [pos.x + q.x * cos + q.y * sin, pos.z - q.x * sin + q.y * cos])
  const outer = obj.props.get('polygon')
  if (!(outer instanceof PackedVec2Array) || outer.points.length < 3) return []
  const holes = obj.props.get('holes')
  return [[ring(outer), ...(Array.isArray(holes) ? holes.filter((h): h is PackedVec2Array => h instanceof PackedVec2Array).map(ring) : [])]]
}

/** Properties for a water body with this polygon (world rings: outer first, then holes). The
 *  position is the outer ring's center; rotation is 0. */
export function bodyProps(polygon: Ring[], level: number): Record<string, Value> {
  const outer = openRing(polygon[0])
  const cx = round(outer.reduce((a, p) => a + p[0], 0) / outer.length)
  const cz = round(outer.reduce((a, p) => a + p[1], 0) / outer.length)
  const local = (r: Ring) => new PackedVec2Array(openRing(r).map((p) => new Vec2(round(p[0] - cx), round(p[1] - cz))))
  return {
    position: new Vec3(cx, level, cz),
    rotation: 0,
    polygon: local(polygon[0]),
    holes: polygon.length > 1 ? polygon.slice(1).map(local) : null,
  }
}

/** polygon-clipping closes rings (last point = first); stored rings aren't. */
function openRing(r: Ring): Ring {
  const n = r.length
  return n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1] ? r.slice(0, -1) : r
}

function ringArea(r: Ring): number {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return Math.abs(a) / 2
}

/** Area of a shape in m² (holes subtracted). */
export function shapeArea(shape: MultiPolygon): number {
  return shape.reduce((sum, poly) => sum + ringArea(poly[0]) - poly.slice(1).reduce((a, h) => a + ringArea(h), 0), 0)
}

/** Rounded to the grid; pieces smaller than MIN_AREA, and tiny holes, dropped. */
function clean(shape: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = []
  const snap = (r: Ring): Ring => openRing(r).map(([x, z]) => [round(x), round(z)] as [number, number])
  for (const poly of shape) {
    const outer = snap(poly[0])
    if (outer.length < 3 || ringArea(outer) < MIN_AREA) continue
    out.push([outer, ...poly.slice(1).map(snap).filter((h) => h.length >= 3 && ringArea(h) >= MIN_AREA)])
  }
  return out
}

const isEmpty = (s: MultiPolygon) => s.length === 0

/** Inputs snapped to a grid with repeated points removed: polygon-clipping can fail on nearly
 *  coincident vertices (overlapping brush circles make plenty). */
function snapped(shape: MultiPolygon, grid: number): MultiPolygon {
  const q = (v: number) => Math.round(v / grid) * grid
  return shape
    .map((poly) => poly.map((r) => {
      const out: Ring = []
      for (const [x, z] of openRing(r)) {
        const p: [number, number] = [q(x), q(z)]
        const last = out.at(-1)
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
      }
      if (out.length > 1 && out[0][0] === out.at(-1)![0] && out[0][1] === out.at(-1)![1]) out.pop()
      return out
    }).filter((r) => r.length >= 3))
    .filter((poly) => poly.length > 0)
}

/** Runs a polygon-clipping operation on snapped inputs; if it still fails, once more on a coarser
 *  grid. */
function clip(op: (a: MultiPolygon, ...b: MultiPolygon[]) => MultiPolygon, a: MultiPolygon, ...b: MultiPolygon[]): MultiPolygon {
  try {
    return clean(op(snapped(a, GRID), ...b.map((x) => snapped(x, GRID))))
  } catch {
    return clean(op(snapped(a, GRID * 5), ...b.map((x) => snapped(x, GRID * 5))))
  }
}

/** Union of any number of shapes (empty ones ignored). */
function unionAll(shapes: MultiPolygon[]): MultiPolygon {
  const list = shapes.filter((x) => !isEmpty(x))
  return list.length ? clip(pc.union, list[0], ...list.slice(1)) : []
}
const difference = (a: MultiPolygon, ...b: MultiPolygon[]) => {
  const cut = b.filter((x) => !isEmpty(x))
  return cut.length && !isEmpty(a) ? clip(pc.difference, a, ...cut) : a
}
const intersects = (a: MultiPolygon, b: MultiPolygon) => !isEmpty(a) && !isEmpty(b) && !isEmpty(clip(pc.intersection, a, b))

/** Area (m²) where two shapes overlap. */
export function overlapArea(a: MultiPolygon, b: MultiPolygon): number {
  return isEmpty(a) || isEmpty(b) ? 0 : shapeArea(clip(pc.intersection, a, b))
}

export function containsPoint(shape: MultiPolygon, x: number, z: number): boolean {
  return shape.some((poly) => insideRing(poly[0], x, z) && !poly.slice(1).some((h) => insideRing(h, x, z)))
}

function insideRing(r: Ring, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[i]
    const [bx, bz] = r[j]
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}

// --- Brush strokes ------------------------------------------------------------------------

/** A circle as a ring (enough segments to stay round at the brush's size). */
export function circle(x: number, z: number, r: number): Ring {
  const n = Math.max(12, Math.min(48, Math.round(r * 6)))
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [x + Math.cos(a) * r, z + Math.sin(a) * r] as [number, number]
  })
}

/** The area a round brush of radius `r` sweeps along `path` (world x/z). */
export function strokeShape(path: [number, number][], r: number): MultiPolygon {
  if (!path.length) return []
  const parts: MultiPolygon = [[circle(path[0][0], path[0][1], r)]]
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    const len = Math.hypot(bx - ax, bz - az)
    parts.push([circle(bx, bz, r)])
    if (len < 1e-6) continue
    // The band between the two circles.
    const nx = (-(bz - az) / len) * r
    const nz = ((bx - ax) / len) * r
    parts.push([[[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]])
  }
  return unionAll(parts.map((p) => [p]))
}

// --- Adding and removing water ------------------------------------------------------------

interface Body {
  obj: MapObject
  shape: MultiPolygon
  level: number
  liquid: string
}

function bodies(doc: MapDocument): Body[] {
  return [...doc.objects.values()]
    .filter((o) => !o.deleted && o.type === 'water')
    .map((o) => ({ obj: o, shape: worldShape(o), level: (o.props.get('position') as Vec3).y, liquid: String(o.props.get('liquid') ?? 'water') }))
    .filter((b) => !isEmpty(b.shape))
}

/** Writes `shape` into a body: the first polygon goes to `keep` (or a new object), any further
 *  separate pieces become new bodies with the same liquid and level. An empty shape deletes
 *  `keep`. Returns the ids. Call inside a session edit. */
function writeBody(session: MapSession, keep: MapObject | null, shape: MultiPolygon, level: number, liquid: string, extra: Record<string, Value> = {}): string[] {
  const ids: string[] = []
  if (isEmpty(shape)) {
    if (keep) session.deleteObject(keep.id)
    return ids
  }
  shape.forEach((poly, i) => {
    const props = { ...bodyProps(poly, level), liquid }
    if (i === 0 && keep) {
      for (const [k, v] of Object.entries(props)) session.setProp(keep.id, k, v)
      ids.push(keep.id)
    } else {
      // New pieces keep the original's extra properties (name, group, locked...).
      ids.push(session.createObject('water', { ...extra, ...props }))
    }
  })
  return ids
}

const extrasOf = (o: MapObject): Record<string, Value> => {
  const out: Record<string, Value> = {}
  for (const k of ['name', 'group', 'locked', 'order']) if (o.props.has(k)) out[k] = o.props.get(k) as Value
  return out
}

export interface AddOptions {
  liquid: string
  /** Dig a basin where the new water lands on dry ground. */
  dig: boolean
  depth: number
  shore: number
  /** Where the stroke / outline started (world x/z): its body's height is kept. */
  start: [number, number]
}

/** Adds water by the rules above, as part of the current edit (also digs the basin). Returns
 *  the ids of the bodies that now hold the new water. */
export function addWater(session: MapSession, shape: MultiPolygon, o: AddOptions): string[] {
  const doc = session.doc
  let add = clean(shape)
  if (isEmpty(add)) return []
  const all = bodies(doc)
  const startBody = all.find((b) => containsPoint(b.shape, o.start[0], o.start[1]))
  const before = unionAll(all.map((b) => b.shape))

  // The surface: the body we started in, else the lowest ground along the new edge (dig), else
  // the ground where we started.
  const fresh = difference(add, before)
  const plan = o.dig && !startBody && !isEmpty(fresh) ? planBasin(doc, fresh, o.depth, o.shore) : null
  const level = startBody ? startBody.level : plan ? plan.level : terrainEdit.heightAtWorld(doc, o.start[0], o.start[1])

  const touching = all.filter((b) => intersects(b.shape, add) || touches(b.shape, add))
  // Same liquid, clearly another height: the new water stops at its edge.
  const apart = touching.filter((b) => b.liquid === o.liquid && Math.abs(b.level - level) > MERGE_LEVEL)
  add = difference(add, ...apart.map((b) => b.shape))
  if (isEmpty(add)) return []
  // Other liquids give way where the new water goes.
  for (const b of touching.filter((t) => t.liquid !== o.liquid)) {
    if (intersects(b.shape, add)) writeBody(session, b.obj, difference(b.shape, add), b.level, b.liquid, extrasOf(b.obj))
  }
  // The same liquid at this height merges into one body (the one we started in, if any).
  const merging = touching.filter((b) => b.liquid === o.liquid && Math.abs(b.level - level) <= MERGE_LEVEL)
  const keep = (startBody && startBody.liquid === o.liquid ? startBody : null) ?? merging[0] ?? null
  for (const b of merging) if (b !== keep) session.deleteObject(b.obj.id)

  // Dig where there was no water before (existing beds stay as they are).
  if (o.dig) {
    const dig = difference(add, before)
    if (!isEmpty(dig)) for (const op of planBasin(doc, dig, o.depth, o.shore, level).ops) session.apply(op)
  }
  const merged = merging.length ? unionAll([add, ...merging.map((b) => b.shape)]) : add
  return writeBody(session, keep?.obj ?? null, merged, level, o.liquid, keep ? extrasOf(keep.obj) : {})
}

/** Cuts `shape` out of every body it covers, as part of the current edit. Returns true if any
 *  water was removed. */
export function eraseWater(session: MapSession, shape: MultiPolygon): boolean {
  const cut = clean(shape)
  let changed = false
  for (const b of bodies(session.doc)) {
    if (!intersects(b.shape, cut)) continue
    writeBody(session, b.obj, difference(b.shape, cut), b.level, b.liquid, extrasOf(b.obj))
    changed = true
  }
  return changed
}

/** Shapes that only share an edge still count as touching (so painting right up to a lake
 *  joins it): some corner of one lies on an edge of the other. */
function touches(a: MultiPolygon, b: MultiPolygon): boolean {
  const near = (pts: Ring, s: MultiPolygon) => {
    const rings = s.flatMap((poly) => poly)
    return pts.some(([x, z]) => rings.some((r) => r.some((p, i) => {
      const q = r[(i + 1) % r.length]
      const dx = q[0] - p[0]
      const dz = q[1] - p[1]
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1)))
      return Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t)) <= GRID * 3
    })))
  }
  const corners = (s: MultiPolygon): Ring => s.flatMap((poly) => poly.flatMap((r) => r))
  return near(corners(b), a) || near(corners(a), b)
}

// --- Basins -------------------------------------------------------------------------------

/** Where the surface of water over `shape` goes, and the terrain ops that dig its basin: surface
 *  at `level` if given, else the lowest ground along the shape's edges; inside, ground lowered
 *  toward `surface - depth`, easing in over `shore` meters from the edge. Ground is never raised,
 *  and an area that is already a hollow below the surface is left as it is. */
export function planBasin(doc: MapDocument, shape: MultiPolygon, depth: number, shore: number, level?: number): { level: number; ops: TerrainOp[] } {
  const rings = shape.flatMap((poly) => poly.map(openRing))
  const edges: [number, number, number, number][] = []
  for (const r of rings) for (let i = 0; i < r.length; i++) edges.push([r[i][0], r[i][1], r[(i + 1) % r.length][0], r[(i + 1) % r.length][1]])
  if (level === undefined) {
    level = Infinity
    // Lowest ground along the edges, sampled every half meter.
    for (const [ax, az, bx, bz] of edges) {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5))
      for (let k = 0; k < steps; k++) level = Math.min(level, terrainEdit.heightAtWorld(doc, ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps))
    }
  }
  const xs = rings.flatMap((r) => r.map((p) => p[0]))
  const zs = rings.flatMap((r) => r.map((p) => p[1]))
  const x0 = Math.floor(Math.min(...xs))
  const z0 = Math.floor(Math.min(...zs))
  const rect = new Rect2i(x0, z0, Math.ceil(Math.max(...xs)) - x0 + 1, Math.ceil(Math.max(...zs)) - z0 + 1)
  const edgeDistance = (x: number, z: number) => {
    let best = Infinity
    for (const [ax, az, bx, bz] of edges) {
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
    }
    return best
  }
  const inside = (x: number, z: number) => containsPoint(shape, x, z)

  // Already a hollow (nothing inside reaches the surface): just fill it. Samples on or right by
  // the edge sit at rim height by definition, so they don't count.
  let interiorMax = -Infinity
  for (let sz = rect.y; sz < rect.endY; sz++)
    for (let sx = rect.x; sx < rect.endX; sx++)
      if (inside(sx, sz) && edgeDistance(sx, sz) >= 0.5) interiorMax = Math.max(interiorMax, terrainEdit.heightAt(doc, sx, sz))
  const surface = level
  if (interiorMax === -Infinity || interiorMax < surface - 0.1) return { level: surface, ops: [] }

  const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2
  const ops = terrainEdit.heightOps(doc, rect, (sx, sz, old) => {
    if (!inside(sx, sz)) return old
    const target = surface - depth * ease(edgeDistance(sx, sz) / shore)
    return Math.min(old, Math.round(target * 1000) / 1000)
  })
  return { level: surface, ops }
}
