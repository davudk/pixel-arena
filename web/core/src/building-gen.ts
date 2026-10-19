// Building generator: a recipe and a seed in, a building's properties out (the same flat paths a
// map stores; see building-layout.ts). Pure data, deterministic per seed, so the editor, tests
// and (later) the server get the same building.
//
// Steps:
//   1. Footprint: a rectangle (or an L, the rectangle minus a corner) of W x D cells.
//   2. Core: the stairs and the hall around them, the same cells on every level, so the run on
//      level L lands in the hall of level L+1 (the floor above the run is left open).
//   3. Zones: the cells left on each level are split into zones (a flat, or a whole house floor),
//      each a rectangle; zones are split into rooms by binary space partitioning, matching the
//      recipe's room list (largest room first).
//   4. Walls between different rooms; doors along a spanning tree of each zone's rooms, starting
//      from the room next to the hall; doors from the hall into each zone; the entrance on the
//      street side (south, +z) or at the corridor's end.
//   5. Windows on outside walls of rooms that want light, every other cell along each wall.
//   6. Validation: every floor cell reachable from the entrance (level 0) or the stairs landing
//      (upper levels) through open edges, doors and doorways. A failed seed retries with the next.

import { furnishLevel, yard, type Furnishing } from './building-furnish'
import { BuildingLayout, STAIR_STEP, type RoomType, type StairDir } from './building-layout'
import { Vec2i, type Value } from './values'

export interface Recipe {
  /** Recipe id, e.g. "house". */
  id: string
  kit: string
  /** Roof style, or several to choose from. */
  roof: Roof | Roof[]
  /** Cells the kit's stairs run over; the kit's cell size, storey height and floor top (m). */
  stairsCells: number
  cellSize: number
  wallHeight: number
  floorY: number
  /** Furnish rooms (building-furnish.ts); give houses a yard. */
  furnish?: boolean
  yard?: boolean
  /** Props in front of the building (street side, south): vehicles, benches, lamps. */
  front?: string[]
  /** Width and depth ranges in cells; storeys range. */
  width: [number, number]
  depth: [number, number]
  storeys: [number, number]
  /** Chance of an L-shaped footprint (houses). */
  lShape?: number
  layout: 'house' | 'corridor'
  /** Rooms per zone (largest first); `levels` gives a list per level for houses. */
  rooms: RoomType[] | ((level: number, storeys: number, rng: Rng) => RoomType[])
}

type Roof = 'gable' | 'hip' | 'flat' | 'none'

export interface Generated {
  props: Record<string, Value>
  /** Furniture and yard props, building-local. */
  children: Furnishing[]
  seed: number
  /** Cells per level, rooms and door count (for tests and labels). */
  summary: { width: number; depth: number; storeys: number; rooms: number; doors: number; windows: number }
}

export type Rng = () => number

/** Mulberry32: a small fast seeded PRNG. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (r: Rng, [lo, hi]: [number, number]) => lo + Math.floor(r() * (hi - lo + 1))

interface Rect { x: number; y: number; w: number; h: number }
const cellsOf = (r: Rect) => {
  const out: Vec2i[] = []
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(new Vec2i(x, y))
  return out
}

/** Rooms that want windows, and how many at most (Infinity: every other cell). */
const LIGHT: Partial<Record<RoomType, number>> = { living: Infinity, bedroom: Infinity, kitchen: Infinity, dining: Infinity, office: Infinity, classroom: Infinity, shop: Infinity, bathroom: 1 }
/** Rooms entered through a door (others through an open doorway). */
const PRIVATE = new Set<RoomType>(['bedroom', 'bathroom', 'storage', 'office'])

/** Generates a building, retrying with the next seed (up to 40 times) until it validates. */
export function generateBuilding(recipe: Recipe, seed: number): Generated {
  for (let i = 0; i < 40; i++) {
    const out = attempt(recipe, seed + i)
    if (out) return out
  }
  throw new Error(`generateBuilding: no valid ${recipe.id} near seed ${seed}`)
}

function attempt(recipe: Recipe, seed: number): Generated | null {
  const r = rng(seed)
  const W = int(r, recipe.width)
  const D = int(r, recipe.depth)
  const storeys = int(r, recipe.storeys)
  const run = recipe.stairsCells
  const roof = Array.isArray(recipe.roof) ? recipe.roof[Math.floor(r() * recipe.roof.length)] : recipe.roof
  const props: Record<string, Value> = { kit: recipe.kit, 'roof/style': roof }

  // 1. Footprint (an L cuts the north-east corner on every level).
  let footprint = cellsOf({ x: 0, y: 0, w: W, h: D })
  if (recipe.lShape && W >= 6 && D >= 6 && r() < recipe.lShape) {
    const cw = Math.max(2, Math.floor(W / 3))
    const cd = Math.max(2, Math.floor(D / 3))
    footprint = footprint.filter((c) => !(c.x >= W - cw && c.y < cd))
  }
  const has = new Set(footprint.map((c) => c.key))

  // 2. Core: hall cells (per level) with stairs, the landing above, and the entrance.
  type Plan = { hall: Set<string>; holes: Set<string>; landing: Vec2i | null }
  const plans: Plan[] = []
  let stairs: { cell: Vec2i; dir: StairDir } | null = null
  let entrance: { cell: Vec2i; edge: string }
  const zones: Rect[][] = [] // per level
  if (recipe.layout === 'house') {
    // A column at x0 from the south edge: entry cell, then the run rising north, then the landing.
    const x0 = 1 + Math.floor(r() * Math.max(1, W - 2))
    const entry = new Vec2i(x0, D - 1)
    entrance = { cell: entry, edge: BuildingLayout.edgeKey(entry.add(new Vec2i(0, 1)), 'N') }
    if (storeys > 1) stairs = { cell: new Vec2i(x0, D - 2), dir: 'N' }
    const runCells = stairs ? Array.from({ length: run }, (_, i) => new Vec2i(x0, D - 2 - i)) : []
    const landing = stairs ? new Vec2i(x0, D - 2 - run) : null
    if (landing && (landing.y < 0 || !has.has(landing.key))) return null
    for (let l = 0; l < storeys; l++) {
      const hall = new Set<string>()
      const holes = new Set<string>()
      if (l === 0) [entry, ...runCells].forEach((c) => hall.add(c.key))
      if (l < storeys - 1) runCells.forEach((c) => hall.add(c.key))
      if (l > 0) {
        runCells.forEach((c) => (hall.add(c.key), holes.add(c.key)))
        hall.add(landing!.key)
      }
      if (l === 0 && landing && storeys > 1) hall.add(landing.key)
      plans.push({ hall, holes, landing: l > 0 ? landing : null })
      // Zones: west and east of the hall column (one zone per side), skipping empty sides.
      const west: Rect = { x: 0, y: 0, w: x0, h: D }
      const east: Rect = { x: x0 + 1, y: 0, w: W - x0 - 1, h: D }
      zones.push([west, east].filter((z) => z.w > 0))
      // Cells of the hall column not used by the core join the zone beside them (below).
    }
  } else {
    // A corridor along the middle row, stairs at its west end rising east, the entrance at its
    // east end; flats north and south of it, split in two when the building is wide.
    const c = Math.floor(D / 2)
    const corridor = Array.from({ length: W }, (_, x) => new Vec2i(x, c))
    stairs = storeys > 1 ? { cell: new Vec2i(0, c), dir: 'E' } : null
    const runCells = stairs ? Array.from({ length: run }, (_, i) => new Vec2i(i, c)) : []
    const landing = stairs ? new Vec2i(run, c) : null
    const last = new Vec2i(W - 1, c)
    entrance = { cell: last, edge: BuildingLayout.edgeKey(last.add(new Vec2i(1, 0)), 'W') }
    for (let l = 0; l < storeys; l++) {
      const hall = new Set(corridor.map((x) => x.key))
      const holes = new Set<string>(l > 0 ? runCells.map((x) => x.key) : [])
      plans.push({ hall, holes, landing: l > 0 ? landing : null })
      const halves = W >= 8 ? 2 : 1
      const z: Rect[] = []
      for (const [y, h] of [[0, c], [c + 1, D - c - 1]] as const) {
        if (h <= 0) continue
        const split = halves === 2 ? Math.floor(W / 2) + (r() < 0.5 ? 0 : 1) - 1 : W
        z.push({ x: 0, y, w: split, h })
        if (halves === 2) z.push({ x: split, y, w: W - split, h })
      }
      zones.push(z)
    }
  }

  // 3. Rooms: each zone's footprint cells split by BSP into the recipe's rooms.
  const roomOf: Map<string, number>[] = [] // per level: cell -> room index
  const roomType: RoomType[] = []
  const roomLevel: number[] = []
  const zoneRooms: number[][] = [] // room indices per zone (with the level)
  const zoneLevel: number[] = []
  for (let l = 0; l < storeys; l++) {
    const map = new Map<string, number>()
    roomOf.push(map)
    const hallRoom = roomType.length
    roomType.push('hall')
    roomLevel.push(l)
    for (const k of plans[l].hall) if (has.has(k)) map.set(k, hallRoom)
    for (const zone of zones[l]) {
      const cells = cellsOf(zone).filter((c) => has.has(c.key) && !plans[l].hall.has(c.key))
      if (!cells.length) continue
      const list = typeof recipe.rooms === 'function' ? recipe.rooms(l, storeys, r) : recipe.rooms
      const parts = bsp(zone, cells, Math.min(list.length, cells.length), r)
      const ids: number[] = []
      // Biggest part gets the first (main) room type.
      parts.sort((a, b) => b.length - a.length)
      parts.forEach((part, i) => {
        const id = roomType.length
        roomType.push(list[i])
        roomLevel.push(l)
        ids.push(id)
        for (const c of part) map.set(c.key, id)
      })
      zoneRooms.push(ids)
      zoneLevel.push(l)
    }
    // House: hall-column cells not in the core belong to the room next to them.
    for (const c of footprint) {
      if (map.has(c.key)) continue
      const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => map.get(`${c.x + dx},${c.y + dy}`)).find((id) => id !== undefined && id !== hallRoom)
      if (near === undefined) return null
      map.set(c.key, near)
    }
  }

  // Cells, rooms (the hall is a room too) and stairs.
  for (let l = 0; l < storeys; l++) {
    for (const c of footprint) {
      props[BuildingLayout.cellPath(l, c)] = true
      props[BuildingLayout.roomPath(l, c)] = roomType[roomOf[l].get(c.key)!]
    }
    if (stairs && l < storeys - 1) props[BuildingLayout.stairsPath(l, stairs.cell)] = stairs.dir
  }

  // 4. Walls between rooms; doors along a spanning tree per zone; hall doors; the entrance.
  let doors = 0
  for (let l = 0; l < storeys; l++) {
    const map = roomOf[l]
    const shared = new Map<string, string[]>() // "a|b" -> edges between rooms a and b
    for (const c of footprint) {
      for (const [dx, dy, side] of [[1, 0, 'W'], [0, 1, 'N']] as const) {
        const n = new Vec2i(c.x + dx, c.y + dy)
        if (!has.has(n.key)) continue
        const a = map.get(c.key)!
        const b = map.get(n.key)!
        if (a === b) continue
        const edge = BuildingLayout.edgeKey(n, side)
        props[BuildingLayout.wallPath(l, edge)] = 'wall'
        // Doors never open onto a stairs hole.
        if (plans[l].holes.has(c.key) || plans[l].holes.has(n.key)) continue
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!shared.has(key)) shared.set(key, [])
        shared.get(key)!.push(edge)
      }
    }
    const open = (a: number, b: number, kind?: string) => {
      const edges = shared.get(a < b ? `${a}|${b}` : `${b}|${a}`)
      if (!edges?.length) return false
      const edge = edges[Math.floor(r() * edges.length)]
      const t = roomType[a] === 'hall' ? roomType[b] : roomType[a]
      props[BuildingLayout.wallPath(l, edge)] = kind ?? (PRIVATE.has(t) ? 'door' : 'doorway')
      doors++
      return true
    }
    const hall = [...map.values()].find((id) => roomType[id] === 'hall')!
    for (let z = 0; z < zoneRooms.length; z++) {
      if (zoneLevel[z] !== l) continue
      const ids = zoneRooms[z]
      // The zone's way in: from the hall into its main room (or the first room touching it),
      // a door for a flat (corridor layout), a doorway inside a house.
      const entry = [ids[0], ...ids.slice(1)].find((id) => shared.has(id < hall ? `${id}|${hall}` : `${hall}|${id}`))
      if (entry === undefined) return null
      open(hall, entry, recipe.layout === 'corridor' ? 'door' : undefined)
      // Spanning tree from the entry room.
      const seen = new Set([entry])
      const queue = [entry]
      while (queue.length) {
        const a = queue.shift()!
        for (const b of ids) {
          if (seen.has(b) || !shared.has(a < b ? `${a}|${b}` : `${b}|${a}`)) continue
          seen.add(b)
          queue.push(b)
          open(a, b)
        }
      }
    }
  }
  props[BuildingLayout.wallPath(0, entrance.edge)] = 'door'
  doors++

  // 5. Windows: every other outside edge of rooms that want light (bathrooms one).
  let windows = 0
  for (let l = 0; l < storeys; l++) {
    const used = new Map<number, number>()
    for (const c of footprint) {
      const id = roomOf[l].get(c.key)!
      const max = LIGHT[roomType[id]] ?? 0
      if (!max || plans[l].holes.has(c.key)) continue
      for (const d of ['N', 'E', 'S', 'W'] as const) {
        const [dx, dy] = STAIR_STEP[d]
        if (has.has(`${c.x + dx},${c.y + dy}`)) continue
        if ((d === 'N' || d === 'S' ? c.x : c.y) % 2 !== 0) continue
        if ((used.get(id) ?? 0) >= max) continue
        const edge = edgeKey(c, d)
        if (l === 0 && edge === entrance.edge) continue
        props[BuildingLayout.wallPath(l, edge)] = 'window'
        used.set(id, (used.get(id) ?? 0) + 1)
        windows++
      }
    }
  }

  // 6. Validate.
  if (!validate(props, run, entrance.cell, plans.map((p) => p.landing))) return null

  // 7. Furniture per level (not on stairs or over them) and, for houses, a yard.
  const children: Furnishing[] = []
  const layout = BuildingLayout.fromObject({ props: new Map(Object.entries(props)) } as unknown as Parameters<typeof BuildingLayout.fromObject>[0])
  if (recipe.furnish !== false)
    for (let l = 0; l < storeys; l++) {
      const blocked = layout.floorOpenings(l, run)
      for (const s of layout.stairs(l).values()) {
        const [dx, dy] = STAIR_STEP[s.dir]
        for (let i = 0; i < run; i++) blocked.add(`${s.cell.x + dx * i},${s.cell.y + dy * i}`)
      }
      children.push(...furnishLevel({ layout, level: l, cs: recipe.cellSize, floorY: l * recipe.wallHeight + recipe.floorY, blocked }, r))
    }
  if (recipe.yard) {
    const cs = recipe.cellSize
    children.push(...yard(W * cs, D * cs, { x: (entrance.cell.x + 0.5) * cs, z: D * cs }, r))
  }
  if (recipe.front?.length) children.push(...frontProps(recipe.front, W * recipe.cellSize, D * recipe.cellSize, recipe.layout === 'house' ? (entrance.cell.x + 0.5) * recipe.cellSize : -99))
  return { props, children, seed, summary: { width: W, depth: D, storeys, rooms: roomType.length, doors, windows } }
}

/** Props in a row along the street side (south), 2.5 m out, spaced evenly and clear of the door;
 *  vehicles side by side parked toward the building. */
function frontProps(ids: string[], width: number, depth: number, doorX: number): Furnishing[] {
  const out: Furnishing[] = []
  const step = width / (ids.length + 1)
  ids.forEach((id, i) => {
    let x = step * (i + 1)
    if (Math.abs(x - doorX) < 2) x += x < doorX ? -2 : 2
    const vehicle = id.startsWith('kenney_cars:') || id.endsWith('schoolbus')
    out.push({ prop: id, x, y: 0, z: depth + (vehicle ? 3.2 : 1.6), rotation: vehicle ? Math.PI : 0 })
  })
  return out
}

/** The edge on side `d` of cell `c`. */
function edgeKey(c: Vec2i, d: StairDir): string {
  if (d === 'W') return BuildingLayout.edgeKey(c, 'W')
  if (d === 'E') return BuildingLayout.edgeKey(c.add(new Vec2i(1, 0)), 'W')
  if (d === 'N') return BuildingLayout.edgeKey(c, 'N')
  return BuildingLayout.edgeKey(c.add(new Vec2i(0, 1)), 'N')
}

/** Splits `cells` (inside `rect`) into `n` connected parts by recursive cuts along the longer
 *  axis, at a random place that keeps every part non-empty. */
function bsp(rect: Rect, cells: Vec2i[], n: number, r: Rng): Vec2i[][] {
  if (n <= 1 || cells.length <= 1) return [cells]
  const alongX = rect.w >= rect.h
  const span = alongX ? rect.w : rect.h
  if (span < 2) return [cells]
  const left = Math.ceil(n / 2)
  // Cut near the share of rooms each side gets, jittered.
  const at = Math.min(span - 1, Math.max(1, Math.round((span * left) / n + (r() - 0.5))))
  const a: Rect = alongX ? { ...rect, w: at } : { ...rect, h: at }
  const b: Rect = alongX ? { ...rect, x: rect.x + at, w: rect.w - at } : { ...rect, y: rect.y + at, h: rect.h - at }
  const inA = (c: Vec2i) => (alongX ? c.x < rect.x + at : c.y < rect.y + at)
  const ca = cells.filter(inA)
  const cb = cells.filter((c) => !inA(c))
  if (!ca.length || !cb.length || !connected(ca) || !connected(cb)) return [cells]
  return [...bsp(a, ca, Math.min(left, ca.length), r), ...bsp(b, cb, Math.min(n - left, cb.length), r)]
}

function connected(cells: Vec2i[]): boolean {
  const set = new Set(cells.map((c) => c.key))
  const seen = new Set([cells[0].key])
  const stack = [cells[0]]
  while (stack.length) {
    const c = stack.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c.x + dx},${c.y + dy}`
      if (set.has(k) && !seen.has(k)) {
        seen.add(k)
        stack.push(Vec2i.fromKey(k))
      }
    }
  }
  return seen.size === set.size
}

/** Every walkable floor cell of each level is reachable from the entrance (level 0) or the
 *  stairs landing (upper levels), through edges without a wall, doors and doorways. Cells over a
 *  stairs run from the level below (`run` cells long) are holes, not floor. */
export function validate(props: Record<string, Value>, run: number, entrance: Vec2i, landings: (Vec2i | null)[]): boolean {
  const layout = BuildingLayout.fromObject({ props: new Map(Object.entries(props)) } as unknown as Parameters<typeof BuildingLayout.fromObject>[0])
  const levels = layout.levelIndices()
  for (const l of levels) {
    const cells = layout.cells(l)
    const holes = layout.floorOpenings(l, run)
    const start = l === 0 ? entrance : landings[l]
    if (!start || !cells.has(start.key) || holes.has(start.key)) return false
    const seen = new Set([start.key])
    const stack = [start]
    while (stack.length) {
      const c = stack.pop()!
      for (const d of ['N', 'E', 'S', 'W'] as const) {
        const [dx, dy] = STAIR_STEP[d]
        const n = new Vec2i(c.x + dx, c.y + dy)
        if (!cells.has(n.key) || holes.has(n.key) || seen.has(n.key)) continue
        const kind = layout.effectiveKind(l, edgeKey(c, d))
        if (kind !== '' && kind !== 'door' && kind !== 'doorway') continue
        seen.add(n.key)
        stack.push(n)
      }
    }
    for (const k of cells.keys()) if (!holes.has(k) && !seen.has(k)) return false
  }
  return true
}
