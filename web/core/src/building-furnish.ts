// Furnishing and yards for generated buildings (building-gen.ts). Pure data: props are named by
// id with their footprints listed here (meters, as the pack manifests give them), so the core
// needs no library. Every model faces +z (south) at rotation 0, back toward -z.
//
// Rooms are furnished from templates per room type, in order:
//   wall items stand with their back to a wall (wall or window, never a door or an opening),
//     centered on a cell edge, or across two cells for long items; companions (nightstands,
//     a chair at a desk, a TV on its cabinet) go with their parent, relative to it;
//   runs line one wall with items side by side (a kitchen counter);
//   center items (a dining table with chairs, a rug) stand in the middle of the room.
// Nothing overlaps, everything stays inside the room's cells with a small margin, and the area in
// front of each door and doorway stays clear. Items that don't fit are skipped.
//
// Yards (houses): a fence around a lot with a gate in front of the entrance, a path from the gate
// to the door, a driveway beside it, trees and a planter.

import { BuildingLayout, STAIR_STEP, type RoomType, type StairDir } from './building-layout'
import type { Rng } from './building-gen'
import { Vec2i } from './values'

export interface Furnishing {
  prop: string
  /** Building-local position (meters) and rotation (radians). */
  x: number
  y: number
  z: number
  rotation: number
  /** Uniform scale (default 1). */
  scale?: number
}

/** Footprints [width along x, depth along z] at rotation 0 (meters). */
const SIZE: Record<string, [number, number]> = {
  bed_double: [1.91, 2.25], bed_single: [1.14, 2.25], cabinet_bed_drawer: [0.53, 0.43], side_table_drawers: [1.07, 0.44],
  lamp_round_floor: [0.3, 0.35], lamp_round_table: [0.3, 0.35], potted_plant: [0.42, 0.48], bookcase_closed: [0.8, 0.5], bookcase_open: [0.8, 0.5],
  lounge_sofa: [1.96, 0.82], lounge_chair: [0.98, 0.82], table_coffee: [1.32, 0.8], cabinet_television: [1.6, 0.5], television_modern: [1.37, 0.26],
  rug_rectangle: [3.14, 1.84], rug_round: [1.84, 1.84], rug_doormat: [0.86, 0.47],
  kitchen_fridge: [0.86, 0.58], kitchen_stove: [0.86, 0.9], kitchen_sink: [0.86, 0.9], kitchen_cabinet: [0.86, 0.9], kitchen_cabinet_drawer: [0.86, 0.9],
  table: [1.68, 0.89], table_round: [1.39, 1.6], chair: [0.4, 0.4], chair_cushion: [0.4, 0.4],
  toilet: [0.63, 0.95], bathroom_sink: [0.68, 0.58], bathtub: [2.38, 1.12], shower: [1.12, 1.16], bathroom_cabinet_drawer: [0.86, 0.64], washer: [0.78, 0.78],
  coat_rack_standing: [0.55, 0.55], desk: [1.47, 0.78], chair_desk: [0.67, 0.63], computer_screen: [0.79, 0.21], laptop: [0.53, 0.48],
  cardboard_box_closed: [0.42, 0.42], cardboard_box_open: [0.74, 0.42], trashcan: [0.42, 0.47],
}
const FURN = 'kenney_furniture:'

interface Companion { id: string; along: number; out: number; y?: number; turn?: number }
interface WallItem { kind: 'wall'; ids: string[]; with?: Companion[]; optional?: number }
interface RunItem { kind: 'run'; ids: string[] }
interface CenterItem { kind: 'center'; ids: string[]; with?: Companion[]; optional?: number }
type Item = WallItem | RunItem | CenterItem

/** Room templates: items in priority order; `optional` is the chance an item is tried at all. */
const TEMPLATES: Partial<Record<RoomType, Item[]>> = {
  bedroom: [
    { kind: 'wall', ids: ['bed_double', 'bed_single'], with: [{ id: 'cabinet_bed_drawer', along: -1.25, out: 0 }, { id: 'cabinet_bed_drawer', along: 1.25, out: 0 }] },
    { kind: 'wall', ids: ['side_table_drawers'] },
    { kind: 'wall', ids: ['bookcase_closed'], optional: 0.5 },
    { kind: 'wall', ids: ['potted_plant', 'lamp_round_floor'], optional: 0.7 },
  ],
  living: [
    { kind: 'wall', ids: ['lounge_sofa'], with: [{ id: 'table_coffee', along: 0, out: 1.15 }] },
    { kind: 'wall', ids: ['cabinet_television'], with: [{ id: 'television_modern', along: 0, out: 0.02, y: 0.62 }] },
    { kind: 'wall', ids: ['lounge_chair'], optional: 0.7 },
    { kind: 'wall', ids: ['bookcase_open', 'bookcase_closed'], optional: 0.6 },
    { kind: 'wall', ids: ['potted_plant'], optional: 0.8 },
    { kind: 'wall', ids: ['lamp_round_floor'], optional: 0.6 },
  ],
  kitchen: [
    { kind: 'run', ids: ['kitchen_fridge', 'kitchen_cabinet', 'kitchen_stove', 'kitchen_cabinet_drawer', 'kitchen_sink', 'kitchen_cabinet'] },
    { kind: 'center', ids: ['table'], optional: 0.6, with: [{ id: 'chair', along: -0.45, out: -0.7, turn: Math.PI }, { id: 'chair', along: 0.45, out: -0.7, turn: Math.PI }, { id: 'chair', along: -0.45, out: 0.7 }, { id: 'chair', along: 0.45, out: 0.7 }] },
    { kind: 'wall', ids: ['trashcan'], optional: 0.6 },
  ],
  dining: [
    { kind: 'center', ids: ['table', 'table_round'], with: [{ id: 'chair_cushion', along: -0.45, out: -0.75, turn: Math.PI }, { id: 'chair_cushion', along: 0.45, out: -0.75, turn: Math.PI }, { id: 'chair_cushion', along: -0.45, out: 0.75 }, { id: 'chair_cushion', along: 0.45, out: 0.75 }] },
    { kind: 'wall', ids: ['side_table_drawers'], optional: 0.7 },
    { kind: 'wall', ids: ['potted_plant'], optional: 0.7 },
  ],
  bathroom: [
    { kind: 'wall', ids: ['toilet'] },
    { kind: 'wall', ids: ['bathroom_sink'] },
    { kind: 'wall', ids: ['bathtub', 'shower'] },
    { kind: 'wall', ids: ['washer', 'bathroom_cabinet_drawer'], optional: 0.6 },
  ],
  hall: [
    { kind: 'wall', ids: ['coat_rack_standing'], optional: 0.6 },
    { kind: 'wall', ids: ['potted_plant'], optional: 0.5 },
  ],
  office: [
    { kind: 'wall', ids: ['desk'], with: [{ id: 'chair_desk', along: 0, out: 0.75, turn: Math.PI }, { id: 'computer_screen', along: 0, out: -0.15, y: 0.77 }] },
    { kind: 'wall', ids: ['bookcase_closed'] },
    { kind: 'wall', ids: ['potted_plant'], optional: 0.6 },
  ],
  storage: [
    { kind: 'wall', ids: ['cardboard_box_closed'] },
    { kind: 'wall', ids: ['cardboard_box_open'] },
    { kind: 'wall', ids: ['cardboard_box_closed'], optional: 0.6 },
  ],
}

/** Rotation that turns a model's back (-z) toward a wall on side `d` of its cell. */
const BACK_TO: Record<StairDir, number> = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }
/** Unit vector from a wall on side `d` into the room. */
const INTO: Record<StairDir, [number, number]> = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }
/** Unit vector along a wall on side `d` (the model's +x after turning). */
const ALONG: Record<StairDir, [number, number]> = { N: [1, 0], S: [-1, 0], E: [0, 1], W: [0, -1] }

interface Box { x0: number; z0: number; x1: number; z1: number }
const MARGIN = 0.05

export interface FurnishContext {
  layout: BuildingLayout
  level: number
  cs: number
  /** Floor height of this level (meters). */
  floorY: number
  /** Cells not to furnish (stairs, the floor over a run). */
  blocked: Set<string>
}

/** Furniture for every room of one level. */
export function furnishLevel(ctx: FurnishContext, r: Rng): Furnishing[] {
  const { layout, level } = ctx
  const rooms = new Map<string, Vec2i[]>() // connected groups of one type, keyed by first cell
  const seen = new Set<string>()
  const types = layout.rooms(level)
  for (const [k, t] of types) {
    if (seen.has(k) || ctx.blocked.has(k)) continue
    const group: Vec2i[] = []
    const stack = [Vec2i.fromKey(k)]
    seen.add(k)
    while (stack.length) {
      const c = stack.pop()!
      group.push(c)
      for (const d of ['N', 'E', 'S', 'W'] as const) {
        const [dx, dz] = STAIR_STEP[d]
        const n = new Vec2i(c.x + dx, c.y + dz)
        if (seen.has(n.key) || ctx.blocked.has(n.key) || types.get(n.key) !== t) continue
        // Same room only if no wall between.
        const kind = layout.effectiveKind(level, edgeOf(c, d))
        if (kind === 'wall' || kind === 'window') continue
        seen.add(n.key)
        stack.push(n)
      }
    }
    rooms.set(k, group)
  }
  const out: Furnishing[] = []
  for (const cells of rooms.values()) out.push(...furnishRoom(ctx, types.get(cells[0].key)!, cells, r))
  return out
}

function furnishRoom(ctx: FurnishContext, type: RoomType, cells: Vec2i[], r: Rng): Furnishing[] {
  const { layout, level, cs, floorY } = ctx
  const template = TEMPLATES[type]
  if (!template) return []
  const inRoom = new Set(cells.map((c) => c.key))
  const taken: Box[] = []
  // Keep the way through each door and doorway clear: a square in front of it on both sides.
  for (const c of cells)
    for (const d of ['N', 'E', 'S', 'W'] as const) {
      const kind = layout.effectiveKind(level, edgeOf(c, d))
      if (kind !== 'door' && kind !== 'doorway' && kind !== '') continue
      const [dx, dz] = STAIR_STEP[d]
      if (kind === '' && inRoom.has(`${c.x + dx},${c.y + dz}`)) continue // open floor within the room
      const [ix, iz] = INTO[d]
      const ex = (c.x + 0.5) * cs - (ix * cs) / 2
      const ez = (c.y + 0.5) * cs - (iz * cs) / 2
      const reach = 1.1
      taken.push(box(ex + (ix * reach) / 2, ez + (iz * reach) / 2, ix ? reach : 1.1, iz ? reach : 1.1))
    }
  const fits = (b: Box) => {
    const corners = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]
    if (!corners.every(([x, z]) => inRoom.has(`${Math.floor(x / cs)},${Math.floor(z / cs)}`))) return false
    // Spanning cells must be joined by open floor (no wall cutting through the box).
    return !taken.some((t) => t.x0 < b.x1 && b.x0 < t.x1 && t.z0 < b.z1 && b.z0 < t.z1)
  }
  // Wall slots: a cell side with a wall or window on it.
  const slots: { c: Vec2i; d: StairDir }[] = []
  for (const c of cells)
    for (const d of ['N', 'E', 'S', 'W'] as const) {
      const kind = layout.effectiveKind(level, edgeOf(c, d))
      if (kind === 'wall' || kind === 'window') slots.push({ c, d })
    }
  const out: Furnishing[] = []
  const put = (id: string, x: number, z: number, rot: number, y = 0) => out.push({ prop: FURN + id, x, y: floorY + y, z, rotation: rot })

  /** Footprint of `id` turned by `rot` (quarter turns), centered at (x, z). */
  const footprint = (id: string, x: number, z: number, rot: number) => {
    const [w, d] = SIZE[id]
    const quarter = Math.round(rot / (Math.PI / 2)) % 2 !== 0
    return box(x, z, quarter ? d : w, quarter ? w : d)
  }

  const tryCompanions = (base: { x: number; z: number; rot: number; d: StairDir | null }, list: Companion[] | undefined) => {
    for (const comp of list ?? []) {
      const [ax, az] = base.d ? ALONG[base.d] : [Math.cos(base.rot), -Math.sin(base.rot)]
      const [ix, iz] = base.d ? INTO[base.d] : [Math.sin(base.rot), Math.cos(base.rot)]
      const x = base.x + ax * comp.along + ix * comp.out
      const z = base.z + az * comp.along + iz * comp.out
      const rot = base.rot + (comp.turn ?? 0)
      if (comp.y) {
        put(comp.id, x, z, rot, comp.y) // on its parent: no footprint of its own
        continue
      }
      const b = footprint(comp.id, x, z, rot)
      if (!fits(b)) continue
      taken.push(b)
      put(comp.id, x, z, rot)
    }
  }

  for (const item of template) {
    if ('optional' in item && item.optional !== undefined && r() > item.optional) continue
    if (item.kind === 'run') {
      // The wall side with the most slots in one straight line; items side by side along it.
      const byLine = new Map<string, { c: Vec2i; d: StairDir }[]>()
      for (const s of slots) {
        const key = `${s.d}:${s.d === 'N' || s.d === 'S' ? s.c.y : s.c.x}`
        if (!byLine.has(key)) byLine.set(key, [])
        byLine.get(key)!.push(s)
      }
      const lines = [...byLine.values()].sort((a, b) => b.length - a.length)
      for (const line of lines) {
        const d = line[0].d
        const [ax, az] = ALONG[d]
        const [ix, iz] = INTO[d]
        line.sort((a, b) => (a.c.x - b.c.x) * ax + (a.c.y - b.c.y) * az)
        const start = line[0].c
        const wallX = (start.x + 0.5) * cs - (ix * cs) / 2
        const wallZ = (start.y + 0.5) * cs - (iz * cs) / 2
        const from = -cs / 2 + 0.1
        let t = from
        const placed: Box[] = []
        const items: Furnishing[] = []
        for (const id of item.ids) {
          const [w, dep] = SIZE[id]
          const x = wallX + ax * (t + w / 2) + ix * (dep / 2 + MARGIN)
          const z = wallZ + az * (t + w / 2) + iz * (dep / 2 + MARGIN)
          const b = footprint(id, x, z, BACK_TO[d])
          if (!fits(b) || placed.some((p) => p.x0 < b.x1 && b.x0 < p.x1 && p.z0 < b.z1 && b.z0 < p.z1)) break
          placed.push(b)
          items.push({ prop: FURN + id, x, y: floorY, z, rotation: BACK_TO[d] })
          t += w
        }
        if (items.length >= 3) {
          taken.push(...placed)
          out.push(...items)
          break
        }
      }
      continue
    }
    if (item.kind === 'center') {
      // The room's middle (of its bounding box), the long side along the room's long side.
      const xs = cells.map((c) => c.x)
      const zs = cells.map((c) => c.y)
      const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * cs
      const cz = ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * cs
      const rot = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs) ? 0 : Math.PI / 2
      for (const id of item.ids) {
        const b = footprint(id, cx, cz, rot)
        if (!fits(b)) continue
        taken.push(b)
        put(id, cx, cz, rot)
        tryCompanions({ x: cx, z: cz, rot, d: null }, item.with)
        break
      }
      continue
    }
    // Wall item: try each slot (shuffled), centered on the cell side, or across two cells.
    const order = [...slots].sort(() => r() - 0.5)
    let done = false
    for (const id of item.ids) {
      const [w, dep] = SIZE[id]
      for (const s of order) {
        const [ax, az] = ALONG[s.d]
        const [ix, iz] = INTO[s.d]
        for (const shift of w > cs * 0.9 ? [cs / 2, -cs / 2] : [0]) {
          const x = (s.c.x + 0.5) * cs - (ix * cs) / 2 + ix * (dep / 2 + MARGIN) + ax * shift
          const z = (s.c.y + 0.5) * cs - (iz * cs) / 2 + iz * (dep / 2 + MARGIN) + az * shift
          const rot = BACK_TO[s.d]
          const b = footprint(id, x, z, rot)
          if (!fits(b)) continue
          // Long items need the neighbouring cell's side to be a wall too.
          if (shift !== 0) {
            const n = new Vec2i(s.c.x + Math.sign(ax * shift), s.c.y + Math.sign(az * shift))
            if (!slots.some((o) => o.d === s.d && o.c.equals(n))) continue
          }
          taken.push(b)
          put(id, x, z, rot)
          tryCompanions({ x, z, rot, d: s.d }, item.with)
          done = true
          break
        }
        if (done) break
      }
      if (done) break
    }
  }
  return out
}

/** A house's yard: fence around a lot (gate in front of the entrance), a path to the door, a
 *  driveway, trees, a planter. `door` is the entrance edge's outside point (meters). */
export function yard(width: number, depth: number, door: { x: number; z: number }, r: Rng): Furnishing[] {
  const out: Furnishing[] = []
  const P = 'kenney_suburban:'
  // The lot: 3 m beside and behind, 7 m in front. Fence pieces at half scale: 1.9 m long, about
  // 1.1 m tall (the pack's own size is a 2.2 m wall).
  const FENCE = 0.5
  const seg = 3.8 * FENCE
  const x0 = -3
  const x1 = Math.max(width + 3, x0 + seg * Math.ceil((width + 6) / seg))
  const z0 = -3
  const z1 = depth + 7
  const len = x1 - x0
  const n = Math.round(len / seg)
  const step = len / n
  const gate = Math.max(0, Math.min(n - 1, Math.floor((door.x - x0) / step)))
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * step
    out.push({ prop: P + 'fence', x, y: 0, z: z0, rotation: 0, scale: FENCE })
    if (i !== gate) out.push({ prop: P + 'fence', x, y: 0, z: z1, rotation: 0, scale: FENCE })
  }
  const m = Math.round((z1 - z0) / seg)
  const zstep = (z1 - z0) / m
  for (let i = 0; i < m; i++) {
    const z = z0 + (i + 0.5) * zstep
    out.push({ prop: P + 'fence', x: x0, y: 0, z, rotation: Math.PI / 2, scale: FENCE })
    out.push({ prop: P + 'fence', x: x1, y: 0, z, rotation: Math.PI / 2, scale: FENCE })
  }
  // Path from the door to the gate.
  const gx = x0 + (gate + 0.5) * step
  for (let z = door.z + 1.6; z < z1 - 0.8; z += 3.2) out.push({ prop: P + 'path_long', x: gx, y: 0, z, rotation: 0 })
  // A driveway on the wider side, from the house to the fence (the fence there opens).
  const left = gx - x0 > x1 - gx
  const dx = left ? x0 + 2.4 : x1 - 2.4
  for (let z = depth + 1.6; z < z1 - 0.8; z += 3.2) out.push({ prop: P + 'driveway_long', x: dx, y: 0, z, rotation: 0 })
  const dIndex = Math.floor((dx - x0) / step)
  const gap = out.findIndex((f) => f.prop === P + 'fence' && Math.abs(f.z - z1) < 0.01 && Math.abs(f.x - (x0 + (dIndex + 0.5) * step)) < 0.01)
  if (gap >= 0) out.splice(gap, 1)
  // Trees in the back corners and one in front; a planter by the path.
  out.push({ prop: P + (r() < 0.5 ? 'tree_large' : 'tree_small'), x: x0 + 1.4, y: 0, z: z0 + 1.4, rotation: r() * Math.PI * 2 })
  out.push({ prop: P + (r() < 0.5 ? 'tree_large' : 'tree_small'), x: x1 - 1.4, y: 0, z: z0 + 1.4, rotation: r() * Math.PI * 2 })
  const tx = left ? x1 - 1.6 : x0 + 1.6
  out.push({ prop: P + 'tree_small', x: tx, y: 0, z: z1 - 2, rotation: r() * Math.PI * 2 })
  // The planter beside the path, away from the front tree, unless the driveway is there.
  const px = gx + (tx > gx ? -2.6 : 2.6)
  if (r() < 0.6 && Math.abs(px - dx) > 3.3 && px > x0 + 1.8 && px < x1 - 1.8) out.push({ prop: P + 'planter', x: px, y: 0, z: depth + 2.2, rotation: 0 })
  return out
}

function box(x: number, z: number, w: number, d: number): Box {
  return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 }
}

function edgeOf(c: Vec2i, d: StairDir): string {
  if (d === 'W') return BuildingLayout.edgeKey(c, 'W')
  if (d === 'E') return BuildingLayout.edgeKey(c.add(new Vec2i(1, 0)), 'W')
  if (d === 'N') return BuildingLayout.edgeKey(c, 'N')
  return BuildingLayout.edgeKey(c.add(new Vec2i(0, 1)), 'N')
}
