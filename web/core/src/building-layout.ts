// Structured view of a building object's flat property paths, plus the rules for which walls
// appear.
//   floors/<L>/cells/<i>,<j> = true        cell (i, j) exists on level L
//   floors/<L>/walls/<edge>  = kind        per-edge override: wall | window | door | doorway | open
//   floors/<L>/stairs/<i>,<j> = dir        stairs in cell (i, j) going up toward dir (N | E | S | W),
//                                           to level L+1; the floor above them is left open
//   floors/<L>/rooms/<i>,<j> = type         the room cell (i, j) belongs to (ROOM_TYPES); a room
//                                           is the connected cells of one type
//   roof/style               = gable | hip | flat | none
// Edge "i,j,W" is the boundary at x = i between cells (i-1, j) and (i, j); "i,j,N" is the
// boundary at z = j between (i, j-1) and (i, j). An edge without an override gets a wall when
// exactly one side is a cell (exterior) and nothing when both or neither are.

import type { MapObject } from './map-object'
import { Rect2i, Vec2i } from './values'

/** doorway: an opening with a frame and no door. */
export const KINDS = ['wall', 'window', 'door', 'doorway', 'open'] as const
/** Room types, in the order the editor lists them. */
export const ROOM_TYPES = ['living', 'bedroom', 'kitchen', 'dining', 'bathroom', 'hall', 'office', 'classroom', 'shop', 'storage', 'ward', 'reception', 'garage'] as const
export type RoomType = (typeof ROOM_TYPES)[number]
export const STAIR_DIRS = ['N', 'E', 'S', 'W'] as const
export type StairDir = (typeof STAIR_DIRS)[number]
/** Cell step for each stairs direction (N is -z, like the map). */
export const STAIR_STEP: Record<StairDir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

export interface Stairs {
  cell: Vec2i
  dir: StairDir
}
export const ROOF_STYLES = ['gable', 'hip', 'flat', 'none'] as const
export type Side = 'W' | 'E' | 'N' | 'S'

export interface Wall {
  kind: string
  /** The cell whose model shows the wall: the inside cell for exterior walls, otherwise the
   *  cell on the positive side. */
  host: Vec2i
  side: Side
}

interface Level {
  cells: Map<string, Vec2i>
  overrides: Map<string, string>
  stairs: Map<string, Stairs>
  rooms: Map<string, RoomType>
}

export class BuildingLayout {
  levels = new Map<number, Level>()
  roofStyle = 'gable'

  static fromObject(obj: MapObject): BuildingLayout {
    const layout = new BuildingLayout()
    const roof = obj.props.get('roof/style')
    if (typeof roof === 'string') layout.roofStyle = roof
    for (const [path, value] of obj.props) {
      if (!path.startsWith('floors/')) continue
      const parts = path.split('/')
      if (parts.length !== 4) continue
      const level = Number(parts[1])
      if (!layout.levels.has(level)) layout.levels.set(level, { cells: new Map(), overrides: new Map(), stairs: new Map(), rooms: new Map() })
      const entry = layout.levels.get(level)!
      if (parts[2] === 'cells') {
        const ij = parts[3].split(',')
        if (ij.length === 2) {
          const c = new Vec2i(Number(ij[0]), Number(ij[1]))
          entry.cells.set(c.key, c)
        }
      } else if (parts[2] === 'walls' && typeof value === 'string') {
        entry.overrides.set(parts[3], value)
      } else if (parts[2] === 'rooms' && typeof value === 'string' && (ROOM_TYPES as readonly string[]).includes(value)) {
        entry.rooms.set(parts[3], value as RoomType)
      } else if (parts[2] === 'stairs' && typeof value === 'string' && (STAIR_DIRS as readonly string[]).includes(value)) {
        const ij = parts[3].split(',')
        if (ij.length === 2) {
          const c = new Vec2i(Number(ij[0]), Number(ij[1]))
          entry.stairs.set(c.key, { cell: c, dir: value as StairDir })
        }
      }
    }
    return layout
  }

  static cellPath(level: number, cell: Vec2i): string {
    return `floors/${level}/cells/${cell.x},${cell.y}`
  }

  static wallPath(level: number, edge: string): string {
    return `floors/${level}/walls/${edge}`
  }

  static roomPath(level: number, cell: Vec2i): string {
    return `floors/${level}/rooms/${cell.x},${cell.y}`
  }

  static stairsPath(level: number, cell: Vec2i): string {
    return `floors/${level}/stairs/${cell.x},${cell.y}`
  }

  /** side: "W" (the cell's west boundary) or "N" (its north boundary). */
  static edgeKey(cell: Vec2i, side: 'W' | 'N'): string {
    return `${cell.x},${cell.y},${side}`
  }

  /** The two cells an edge separates: [negative side, positive side]. */
  static edgeCells(edge: string): [Vec2i, Vec2i] {
    const [x, y, side] = edge.split(',')
    const c = new Vec2i(Number(x), Number(y))
    return [c.sub(side === 'W' ? new Vec2i(1, 0) : new Vec2i(0, 1)), c]
  }

  cells(level: number): Map<string, Vec2i> {
    return this.levels.get(level)?.cells ?? new Map()
  }

  overrides(level: number): Map<string, string> {
    return this.levels.get(level)?.overrides ?? new Map()
  }

  /** Stairs on a level whose cell exists (keyed by cell). */
  stairs(level: number): Map<string, Stairs> {
    const out = new Map<string, Stairs>()
    for (const [k, s] of this.levels.get(level)?.stairs ?? []) if (this.cells(level).has(k)) out.set(k, s)
    return out
  }

  /** Room type per existing cell of a level (cells without one are left out). */
  rooms(level: number): Map<string, RoomType> {
    const out = new Map<string, RoomType>()
    for (const [k, t] of this.levels.get(level)?.rooms ?? []) if (this.cells(level).has(k)) out.set(k, t)
    return out
  }

  /** Cells of `level` with no floor: above stairs from the level below, each stairs run being
   *  `length` cells long (the cell itself and the next ones in its direction). */
  floorOpenings(level: number, length = 1): Set<string> {
    const out = new Set<string>()
    for (const s of this.stairs(level - 1).values()) {
      const [dx, dz] = STAIR_STEP[s.dir]
      for (let i = 0; i < length; i++) out.add(`${s.cell.x + dx * i},${s.cell.y + dz * i}`)
    }
    return out
  }

  /** Levels that have at least one cell, ascending. */
  levelIndices(): number[] {
    return [...this.levels.keys()].filter((l) => this.cells(l).size > 0).sort((a, b) => a - b)
  }

  isEmpty(): boolean {
    return this.levelIndices().length === 0
  }

  /** The wall kind an edge shows on a level ("" for none). */
  effectiveKind(level: number, edge: string): string {
    const lc = this.cells(level)
    const [pa, pb] = BuildingLayout.edgeCells(edge)
    const a = lc.has(pa.key)
    const b = lc.has(pb.key)
    if (!a && !b) return ''
    const kind = this.overrides(level).get(edge) ?? (a !== b ? 'wall' : '')
    return kind === 'open' ? '' : kind
  }

  /** Visible walls on a level, keyed by edge. */
  walls(level: number): Map<string, Wall> {
    const lc = this.cells(level)
    const candidates = new Set<string>()
    for (const c of lc.values()) {
      candidates.add(BuildingLayout.edgeKey(c, 'W'))
      candidates.add(BuildingLayout.edgeKey(c.add(new Vec2i(1, 0)), 'W'))
      candidates.add(BuildingLayout.edgeKey(c, 'N'))
      candidates.add(BuildingLayout.edgeKey(c.add(new Vec2i(0, 1)), 'N'))
    }
    for (const e of this.overrides(level).keys()) candidates.add(e)
    const out = new Map<string, Wall>()
    for (const e of candidates) {
      const kind = this.effectiveKind(level, e)
      if (kind === '') continue
      const [pa, pb] = BuildingLayout.edgeCells(e)
      const west = e.endsWith('W')
      if (lc.has(pa.key) && !lc.has(pb.key)) out.set(e, { kind, host: pa, side: west ? 'E' : 'S' })
      else out.set(e, { kind, host: pb, side: west ? 'W' : 'N' })
    }
    return out
  }

  /** Roof footprints: level -> rectangles of the cells whose highest level is that level. */
  roofGroups(): Map<number, Rect2i[]> {
    const top = new Map<string, { cell: Vec2i; level: number }>()
    for (const l of this.levelIndices())
      for (const c of this.cells(l).values()) top.set(c.key, { cell: c, level: Math.max(top.get(c.key)?.level ?? l, l) })
    const byLevel = new Map<number, Map<string, Vec2i>>()
    for (const { cell, level } of top.values()) {
      if (!byLevel.has(level)) byLevel.set(level, new Map())
      byLevel.get(level)!.set(cell.key, cell)
    }
    const out = new Map<number, Rect2i[]>()
    for (const [l, cells] of byLevel) out.set(l, BuildingLayout.decompose(cells))
    return out
  }

  /** Greedy split of a cell set into rectangles: row-major scan, widen along x, then extend
   *  down while whole rows fit. */
  static decompose(cells: Map<string, Vec2i>): Rect2i[] {
    const todo = new Set(cells.keys())
    const order = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x)
    const has = (x: number, y: number) => todo.has(`${x},${y}`)
    const out: Rect2i[] = []
    for (const s of order) {
      if (!todo.has(s.key)) continue
      let w = 1
      while (has(s.x + w, s.y)) w++
      let h = 1
      for (;;) {
        let rowOk = true
        for (let x = 0; x < w; x++) if (!has(s.x + x, s.y + h)) { rowOk = false; break }
        if (!rowOk) break
        h++
      }
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) todo.delete(`${s.x + x},${s.y + z}`)
      out.push(new Rect2i(s.x, s.y, w, h))
    }
    return out
  }
}
