// Builds a building's scene from its BuildingLayout and kit (KitDef in library.ts), with a
// foundation under the lowest level and generated roofs. Each level is its own group
// (userData.level) and roofs are grouped per level (userData.roofLevel), so setCutaway() can hide
// everything above the level being edited.
//
// Building-local space: cell (i, j) of level L spans [i, i+1] x [j, j+1] * cellSize, floor at
// y = L * wallHeight.
//   Edge kits: wall pieces (wall, window, door, doorway; a door can be a doorway wall plus a leaf)
//   on cell edges, interior edges included; floor pieces in cells, except where stairs from the
//   level below come up, covered by the room type's floor (ROOM_FLOORS); stairs pieces stretched
//   over their run. Wall pieces carry userData.wall (side, interior) for cutWalls().
//   Block kits: one solid piece per cell, turned so its front faces the cell's outside side: the
//   door side first, then a corner piece for two adjacent outside sides, then a window or plain
//   wall side, else the plain block.

import * as THREE from 'three'
import { BuildingLayout, STAIR_STEP, Vec2i, type MapObject, type RoomType, type StairDir } from '@pixel-arena/core'
import type { KitDef, KitRole, Library } from '../library/library'
import { loadModel, type Model } from '../library/models'
import { addRoof, MeshBuilder } from './roof-mesh'

const FOUNDATION_DEPTH = 2
/** Yaw that turns a piece facing +X (east) to face each side. */
const SIDE_YAW: Record<string, number> = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 }
/** Yaw that turns something pointing north (-Z) to point toward each side. */
const DIR_YAW: Record<StairDir, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }
const CLOCKWISE: Record<StairDir, StairDir> = { N: 'E', E: 'S', S: 'W', W: 'N' }
const DEFAULT_COLORS = { roof: '#3f9e8f', gable: '#9a5b3e', foundation: '#8f8a84' }

/** Each room type's floor: a terrain material (packs/sbs_textures) by name, with a flat color
 *  for when the textures are missing. Also shown on the room choices in Build mode. */
export const ROOM_FLOORS: Record<RoomType, { material: string; color: string }> = {
  living: { material: 'Planks', color: '#a8743f' },
  bedroom: { material: 'Weathered boards', color: '#8f7a62' },
  kitchen: { material: 'Checkered', color: '#d8d4cc' },
  dining: { material: 'Herringbone', color: '#9b6a3e' },
  bathroom: { material: 'Blue tiles', color: '#7fa6c4' },
  hall: { material: 'Stone slabs', color: '#a7a39b' },
  office: { material: 'Flagstones', color: '#8b8a86' },
  classroom: { material: 'Marble', color: '#d9d6cf' },
  shop: { material: 'Terracotta', color: '#c0714e' },
  storage: { material: 'Gravel', color: '#8a857c' },
}
const roomMaterials = new Map<string, THREE.Material>()
/** The floor material of a room type (texture from the library's terrain materials). */
function roomMaterial(type: RoomType, library: Library): THREE.Material {
  let m = roomMaterials.get(type)
  if (m) return m
  const floor = ROOM_FLOORS[type]
  const def = [...library.terrain.values()].find((t) => t.name === floor.material)
  if (def) {
    const tex = new THREE.TextureLoader().load(def.url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.NearestFilter
    tex.repeat.set(1 / def.scale, 1 / def.scale)
    m = new THREE.MeshLambertMaterial({ map: tex })
  } else m = new THREE.MeshLambertMaterial({ color: floor.color })
  roomMaterials.set(type, m)
  return m
}

let vertexMaterial: THREE.MeshLambertMaterial | null = null
function vertexColored(): THREE.MeshLambertMaterial {
  return (vertexMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))
}

export async function buildBuilding(obj: MapObject, library: Library): Promise<THREE.Group> {
  const root = new THREE.Group()
  const layout = BuildingLayout.fromObject(obj)
  const kit: KitDef | undefined = library.kits.get(String(obj.props.get('kit') ?? ''))
  const cs = kit?.cellSize ?? 3
  const h = kit?.wallHeight ?? 3
  const colors = kit?.colors ?? DEFAULT_COLORS

  // Every role's models, loaded once.
  const roles = new Map<KitRole, Model[]>()
  await Promise.all(Object.entries(kit?.pieces ?? {}).map(async ([role, ids]) => {
    const models = await Promise.all((ids ?? []).map((id) => {
      const prop = library.props.get(id)
      return prop ? loadModel(prop).catch(() => null) : null
    }))
    roles.set(role as KitRole, models.filter((m): m is Model => !!m))
  }))
  const get = (role: KitRole) => (roles.get(role)?.length ? roles.get(role)! : null)

  const levels = layout.levelIndices()
  for (const level of levels) {
    const group = new THREE.Group()
    group.userData.level = level
    root.add(group)
    const y = level * h
    const center = (c: Vec2i) => new THREE.Vector3((c.x + 0.5) * cs, y, (c.y + 0.5) * cs)
    if (kit?.style === 'block') buildBlocks(group, layout, level, kit, get, center)
    else {
      const openings = layout.floorOpenings(level, kit?.stairsCells ?? 1)
      const floor = get('floor')
      const rooms = layout.rooms(level)
      const floorTop = floor ? Math.max(...floor.map((m) => m.box.max.y)) : 0
      for (const c of layout.cells(level).values()) {
        if (openings.has(c.key)) continue
        if (floor) for (const m of floor) group.add(Object.assign(place(m.scene, center(c), 0), { userData: { floor: true } }))
        const type = rooms.get(c.key)
        if (type) {
          // World-aligned UVs, so a room's floor pattern runs on across its cells.
          const plate = new THREE.PlaneGeometry(cs, cs).rotateX(-Math.PI / 2)
          const uv = plate.attributes.uv as THREE.BufferAttribute
          const pos = plate.attributes.position as THREE.BufferAttribute
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (c.x + 0.5) * cs + pos.getX(i), -((c.y + 0.5) * cs + pos.getZ(i)))
          const mesh = new THREE.Mesh(plate, roomMaterial(type, library))
          mesh.position.copy(center(c)).setY(y + floorTop + 0.01)
          mesh.receiveShadow = true
          mesh.userData.floor = true
          group.add(mesh)
        }
      }
      for (const w of layout.walls(level).values()) {
        const models = get(w.kind as KitRole) ?? (w.kind === 'doorway' ? get('door')?.slice(0, 1) : null) ?? get('wall')
        const [ea, eb] = BuildingLayout.edgeCells(edgeOf(w.host, w.side as StairDir))
        const interior = layout.cells(level).has(ea.key) && layout.cells(level).has(eb.key)
        const wall = new THREE.Group()
        wall.userData.wall = { side: w.side, interior }
        if (models) for (const m of models) wall.add(kit?.pivot === 'center' ? onEdge(m, center(w.host), w.side, cs) : place(m.scene, center(w.host), SIDE_YAW[w.side]))
        else wall.add(fallbackWall(center(w.host), w.side, cs, h, colors.gable))
        group.add(wall)
      }
      const stairs = get('stairs')
      if (stairs) for (const s of layout.stairs(level).values()) for (const m of stairs) group.add(stairsPiece(m, s.cell, s.dir, level, kit!, cs, h))
    }
    if (level === levels[0]) {
      const mb = new MeshBuilder()
      for (const c of layout.cells(level).values())
        mb.box(new THREE.Vector3(c.x * cs, y - FOUNDATION_DEPTH, c.y * cs), new THREE.Vector3((c.x + 1) * cs, y, (c.y + 1) * cs), new THREE.Color(colors.foundation))
      const m = new THREE.Mesh(mb.build(), vertexColored())
      m.castShadow = m.receiveShadow = true
      group.add(m)
    }
  }

  if (layout.roofStyle !== 'none') {
    for (const [level, rects] of layout.roofGroups()) {
      const mb = new MeshBuilder()
      for (const r of rects)
        addRoof(mb, { x: r.x * cs, y: r.y * cs, w: r.w * cs, h: r.h * cs }, (level + 1) * h, layout.roofStyle, new THREE.Color(colors.roof), new THREE.Color(colors.gable))
      if (mb.empty) continue
      const m = new THREE.Mesh(mb.build(), vertexColored())
      m.castShadow = m.receiveShadow = true
      m.userData.roofLevel = level
      root.add(m)
    }
  }
  return root
}

/** Block kits: one piece per cell, chosen and turned by the cell's outside sides. */
function buildBlocks(group: THREE.Group, layout: BuildingLayout, level: number, kit: KitDef, get: (r: KitRole) => Model[] | null, center: (c: Vec2i) => THREE.Vector3) {
  const cells = layout.cells(level)
  for (const c of cells.values()) {
    const kinds = {} as Record<StairDir, string>
    for (const d of ['N', 'E', 'S', 'W'] as StairDir[]) {
      const [dx, dz] = STAIR_STEP[d]
      kinds[d] = cells.has(`${c.x + dx},${c.y + dz}`) ? '' : layout.effectiveKind(level, edgeOf(c, d))
    }
    const outside = (['N', 'E', 'S', 'W'] as StairDir[]).filter((d) => kinds[d] !== '')
    let role: KitRole = 'block'
    let face: StairDir = kit.front
    const door = outside.find((d) => kinds[d] === 'door' || kinds[d] === 'doorway')
    const corner = get('corner') && outside.find((d) => kinds[CLOCKWISE[d]] !== '' && outside.includes(CLOCKWISE[d]))
    if (door) [role, face] = ['door', door]
    else if (corner) [role, face] = ['corner', corner]
    else if (outside.length) {
      const d = outside.find((x) => kinds[x] === 'window') ?? outside[0]
      ;[role, face] = [kinds[d] === 'window' ? 'window' : 'wall', d]
    }
    const models = get(role) ?? get('wall') ?? get('block')
    if (!models) continue
    for (const m of models) group.add(place(m.scene, center(c), DIR_YAW[face] - DIR_YAW[kit.front]))
  }
}

/** The edge on side `d` of cell `c`. */
function edgeOf(c: Vec2i, d: StairDir): string {
  if (d === 'W') return BuildingLayout.edgeKey(c, 'W')
  if (d === 'E') return BuildingLayout.edgeKey(c.add(new Vec2i(1, 0)), 'W')
  if (d === 'N') return BuildingLayout.edgeKey(c, 'N')
  return BuildingLayout.edgeKey(c.add(new Vec2i(0, 1)), 'N')
}

/** A centered wall piece moved onto its cell's `side` edge, lying along it. */
function onEdge(m: Model, cellCenter: THREE.Vector3, side: string, cs: number): THREE.Object3D {
  const size = m.box.getSize(new THREE.Vector3())
  const o = m.scene.clone()
  // Panels thin along Z (rather than X) are turned to face X first.
  if (size.x > size.z) o.rotation.y = Math.PI / 2
  o.position.x = cs / 2
  const holder = new THREE.Group()
  holder.add(o)
  holder.position.copy(cellCenter)
  holder.rotation.y = SIDE_YAW[side]
  return holder
}

/** Stairs stretched over their run (stairsCells long, one storey high), rising toward `dir`.
 *  Pieces are assumed to rise along their long side toward -Z / -X (north / west). */
function stairsPiece(m: Model, cell: Vec2i, dir: StairDir, level: number, kit: KitDef, cs: number, h: number): THREE.Object3D {
  const size = m.box.getSize(new THREE.Vector3())
  const run = kit.stairsCells * cs
  const o = m.scene.clone()
  const alongX = size.x > size.z
  if (alongX) o.rotation.y = -Math.PI / 2 // long side along X (rising west) -> along Z (rising north)
  const long = alongX ? size.x : size.z
  const inner = new THREE.Group()
  inner.add(o)
  inner.scale.set(1, h / Math.max(size.y, 0.01), run / Math.max(long, 0.01))
  const [dx, dz] = STAIR_STEP[dir]
  const holder = new THREE.Group()
  holder.add(inner)
  holder.position.set((cell.x + 0.5 + (dx * (kit.stairsCells - 1)) / 2) * cs, level * h, (cell.y + 0.5 + (dz * (kit.stairsCells - 1)) / 2) * cs)
  holder.rotation.y = DIR_YAW[dir]
  return holder
}

function fallbackWall(center: THREE.Vector3, side: string, cs: number, h: number, color: string): THREE.Object3D {
  const mb = new MeshBuilder()
  mb.box(new THREE.Vector3(cs * 0.4, 0, -cs * 0.5), new THREE.Vector3(cs * 0.5, h, cs * 0.5), new THREE.Color(color))
  const m = new THREE.Mesh(mb.build(), vertexColored())
  m.position.copy(center)
  m.rotation.y = SIDE_YAW[side]
  return m
}

/** Walls left standing low when cut away (fraction of their height). */
const CUT_HEIGHT = 0.22
const SIDE_NORMAL: Record<string, THREE.Vector3> = { E: new THREE.Vector3(1, 0, 0), W: new THREE.Vector3(-1, 0, 0), N: new THREE.Vector3(0, 0, -1), S: new THREE.Vector3(0, 0, 1) }

/** Like a dollhouse: on the level being viewed (`level`, -1 = none), interior walls and the
 *  exterior walls whose outside faces the camera (`viewDir`, world) are cut down low, so the
 *  rooms can be seen; everything else stands. */
export function cutWalls(root: THREE.Object3D, level: number, viewDir: THREE.Vector3) {
  const toCamera = viewDir.clone().negate().setY(0).normalize()
  const turn = new THREE.Quaternion().setFromEuler(root.rotation)
  for (const child of root.children) {
    if (child.userData.level === undefined) continue
    const cut = level >= 0 && child.userData.level === level
    for (const wall of child.children) {
      const info = wall.userData.wall as { side: string; interior: boolean } | undefined
      if (!info) continue
      const facing = SIDE_NORMAL[info.side].clone().applyQuaternion(turn).dot(toCamera) > 0.1
      wall.scale.y = cut && (info.interior || facing) ? CUT_HEIGHT : 1
    }
  }
}

/** Shows levels up to `level` and roofs below it; -1 shows everything. */
export function setCutaway(root: THREE.Object3D, level: number) {
  for (const child of root.children) {
    if (child.userData.level !== undefined) child.visible = level < 0 || child.userData.level <= level
    else if (child.userData.roofLevel !== undefined) child.visible = level < 0 || child.userData.roofLevel < level
  }
}

function place(template: THREE.Object3D, position: THREE.Vector3, yaw: number): THREE.Object3D {
  const o = template.clone()
  const holder = new THREE.Group()
  holder.add(o)
  holder.position.copy(position)
  holder.rotation.y = yaw
  return holder
}
