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
// Draw calls: a building's pieces are drawn as one InstancedMesh per (geometry, material), and
// its room floors as one merged mesh per room type, both ordered by level, so the cutaway draws
// a prefix (userData.levelCounts; instanceBuilding). The level groups and their wall groups stay,
// empty, as handles: cutWalls() scales the wall groups and rewrites their instances. Floors cast
// no shadows (userData.noShadow): nothing that lies flat throws a shadow worth drawing.
// On the map, the world view draws all buildings together instead (building-batch.ts): it takes
// each building's parts (partsOf: pieces, room floor plates, foundation, roofs) and strips the
// building down to its handles.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BuildingLayout, STAIR_STEP, Vec2i, type MapObject, type RoomType, type StairDir } from '@pixel-arena/core'
import type { KitDef, KitRole, Library } from '../library/library'
import { loadModel, type Model } from '../library/models'
import { addRoof, MeshBuilder } from './roof-mesh'

const FOUNDATION_DEPTH = 2
/** Yaw that turns a piece facing +X (east) to face each side. */
const SIDE_YAW: Record<string, number> = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 }
/** Yaw that turns something pointing north (-Z) to point toward each side. */
const DIR_YAW: Record<StairDir, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }
/** The side before each one going clockwise (N E S W): a corner piece's second outside face,
 *  counted from its front (Kenney's corner blocks: front S, cut corner toward E). */
const COUNTERCLOCKWISE: Record<StairDir, StairDir> = { N: 'W', E: 'N', S: 'E', W: 'S' }
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
  ward: { material: 'Hex paving', color: '#c9c4bb' },
  reception: { material: 'Sandstone', color: '#c4a77d' },
  garage: { material: 'Cobblestone', color: '#7f7b74' },
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

/** A kit piece instance: in the root's space, or in its wall group's (`wall`) when it has one. */
export interface PiecePart {
  key: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  floor: boolean
  level: number
  wall: THREE.Object3D | null
  matrix: THREE.Matrix4
}
/** What a building draws, in its root's space (for drawing many buildings together). */
export interface BuildingParts {
  pieces: PiecePart[]
  plates: { material: THREE.Material; level: number; geometry: THREE.BufferGeometry }[]
  foundation: THREE.Mesh | null
  roofs: THREE.Mesh[]
  batch: THREE.Group
}
const parts = new WeakMap<THREE.Object3D, BuildingParts>()
export function partsOf(root: THREE.Object3D): BuildingParts | undefined {
  return parts.get(root)
}

export async function buildBuilding(obj: MapObject, library: Library): Promise<THREE.Group> {
  const root = new THREE.Group()
  const record: BuildingParts = { pieces: [], plates: [], foundation: null, roofs: [], batch: new THREE.Group() }
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
    const found = models.filter((m): m is Model => !!m)
    roles.set(role as KitRole, kit && Object.keys(kit.palette).length ? found.map((m) => restyled(m, kit)) : found)
  }))
  const get = (role: KitRole) => (roles.get(role)?.length ? roles.get(role)! : null)

  const levels = layout.levelIndices()
  // Room floor plates of every level, per room type, merged after the levels are built.
  const plates = new Map<RoomType, { level: number; geometry: THREE.BufferGeometry }[]>()
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
          const at = center(c)
          plate.translate(at.x, y + floorTop + 0.01, at.z)
          if (!plates.has(type)) plates.set(type, [])
          plates.get(type)!.push({ level, geometry: plate })
        }
      }
      for (const w of layout.walls(level).values()) {
        const models = get(w.kind as KitRole) ?? (w.kind === 'doorway' ? get('door')?.slice(0, 1) : null) ?? get('wall')
        const [ea, eb] = BuildingLayout.edgeCells(edgeOf(w.host, w.side as StairDir))
        const interior = layout.cells(level).has(ea.key) && layout.cells(level).has(eb.key)
        // The wall's group sits at its floor, so cutting it down (scale y) keeps it on that floor.
        const wall = new THREE.Group()
        wall.position.y = y
        wall.userData.wall = { side: w.side, interior, edge: edgeOf(w.host, w.side as StairDir) }
        const at = center(w.host).setY(0)
        if (models) for (const m of models) wall.add(kit?.pivot === 'center' ? onEdge(m, at, w.side, cs) : place(m.scene, at, SIDE_YAW[w.side]))
        else wall.add(fallbackWall(at, w.side, cs, h, colors.gable))
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
      record.foundation = m
    }
  }
  const batch = instanceBuilding(root, record.pieces)
  record.batch = batch
  // One mesh per room type, its plates in level order (the cutaway draws a prefix).
  for (const [type, list] of plates) {
    const geometry = mergeGeometries(list.map((p) => p.geometry))
    const per = list[0].geometry.index!.count
    const mesh = new THREE.Mesh(geometry, roomMaterial(type, library))
    for (const p of list) record.plates.push({ material: mesh.material, level: p.level, geometry: p.geometry })
    mesh.receiveShadow = true
    mesh.userData = { floor: true, noShadow: true, levelCounts: prefixCounts(list.map((p) => p.level), per) }
    batch.add(mesh)
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
      record.roofs.push(m)
    }
  }
  parts.set(root, record)
  return root
}

// --- Restyled pieces (kit palettes) ------------------------------------------------------------

const styledModels = new Map<string, Model>()
const styledMaps = new Map<string, THREE.Texture>()

/** The model with its colormap cells swapped as the kit's palette says (cached per kit). */
function restyled(m: Model, kit: KitDef): Model {
  const key = `${kit.id}|${m.prop.id}`
  const hit = styledModels.get(key)
  if (hit) return hit
  const scene = m.scene.clone(true)
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const swap = (mat: THREE.Material) => {
      const std = mat as THREE.MeshStandardMaterial
      if (!std.map?.image) return mat
      const c = std.clone()
      c.map = recolor(std.map, kit)
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
  const out: Model = { ...m, scene }
  styledModels.set(key, out)
  return out
}

function recolor(map: THREE.Texture, kit: KitDef): THREE.Texture {
  const key = `${kit.id}|${map.uuid}`
  const hit = styledMaps.get(key)
  if (hit) return hit
  const img = map.image as CanvasImageSource & { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const cw = img.width / 16
  const ch = img.height / 4
  const source = ctx.getImageData(0, 0, img.width, img.height)
  for (const [to, from] of Object.entries(kit.palette)) {
    const [tc, tr] = to.split(',').map(Number)
    const [fc, fr] = from.split(',').map(Number)
    ctx.putImageData(source, (tc - fc) * cw, (tr - fr) * ch, fc * cw, fr * ch, cw, ch)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = map.colorSpace
  tex.flipY = map.flipY
  tex.magFilter = map.magFilter
  tex.minFilter = map.minFilter
  tex.wrapS = map.wrapS
  tex.wrapT = map.wrapT
  styledMaps.set(key, tex)
  return tex
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
    const corner = get('corner') && outside.find((d) => outside.includes(COUNTERCLOCKWISE[d]))
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
 *  rooms can be seen; everything else stands. `keepEdge` stays full height (the wall being
 *  edited under the cursor). */
export function cutWalls(root: THREE.Object3D, level: number, viewDir: THREE.Vector3, keepEdge = '') {
  const toCamera = viewDir.clone().negate().setY(0).normalize()
  const turn = new THREE.Quaternion().setFromEuler(root.rotation)
  for (const child of root.children) {
    if (child.userData.level === undefined) continue
    const cut = level >= 0 && child.userData.level === level
    for (const wall of child.children) {
      const info = wall.userData.wall as { side: string; interior: boolean; edge: string } | undefined
      if (!info) continue
      const facing = SIDE_NORMAL[info.side].clone().applyQuaternion(turn).dot(toCamera) > 0.1
      const scale = cut && (info.interior || facing) && info.edge !== keepEdge ? CUT_HEIGHT : 1
      if (wall.scale.y === scale) continue
      wall.scale.y = scale
      wall.updateMatrix()
      for (const p of wallParts.get(wall) ?? []) {
        p.mesh.setMatrixAt(p.index, tmp.multiplyMatrices(wall.matrix, p.local))
        p.mesh.instanceMatrix.needsUpdate = true
      }
    }
  }
}

/** Shows levels up to `level` and roofs below it; -1 shows everything. */
export function setCutaway(root: THREE.Object3D, level: number) {
  for (const child of root.children) {
    if (child.userData.level !== undefined) child.visible = level < 0 || child.userData.level <= level
    else if (child.userData.roofLevel !== undefined) child.visible = level < 0 || child.userData.roofLevel < level
    else if (child.userData.batch)
      for (const m of child.children as THREE.Mesh[]) {
        const counts = m.userData.levelCounts as [number, number][]
        let n = 0
        for (const [l, c] of counts) if (level < 0 || l <= level) n = c
        if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).count = n
        else m.geometry.setDrawRange(0, n)
        m.visible = n > 0
      }
  }
}

/** [level, items up to and including that level] for items listed in level order, `per` units
 *  (instances, indices) each. */
function prefixCounts(levels: number[], per = 1): [number, number][] {
  const out: [number, number][] = []
  levels.forEach((l, i) => {
    if (out.length && out[out.length - 1][0] === l) out[out.length - 1][1] = (i + 1) * per
    else out.push([l, (i + 1) * per])
  })
  return out
}

// --- Instancing ---------------------------------------------------------------------------------

/** A wall's instances: which instance of which mesh, and its matrix in the wall group's space. */
interface WallPart {
  mesh: THREE.InstancedMesh
  index: number
  local: THREE.Matrix4
}
const wallParts = new WeakMap<THREE.Object3D, WallPart[]>()
const tmp = new THREE.Matrix4()

/** Moves the meshes of a building's levels (kit pieces; not the foundation, which is the only
 *  vertex-colored mesh there) into one InstancedMesh per (geometry, material, floor tag), their
 *  instances in level order, under a `batch` group added to `root`, which it returns. Level
 *  groups keep their wall groups, empty, as handles (userData.wall; instances in wallParts). */
function instanceBuilding(root: THREE.Group, out: PiecePart[]): THREE.Group {
  root.updateMatrixWorld(true)
  type Entry = { matrix: THREE.Matrix4; wall: THREE.Object3D | null; level: number }
  const buckets = new Map<string, { mesh: THREE.Mesh; floor: boolean; entries: Entry[] }>()
  const levels = root.children.filter((c) => c.userData.level !== undefined).sort((a, b) => a.userData.level - b.userData.level)
  for (const level of levels) {
    const moved: THREE.Object3D[] = []
    for (const child of level.children) {
      const wall = child.userData.wall ? child : null
      child.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || (mesh.material as THREE.MeshLambertMaterial).vertexColors) return
        let floor = false
        for (let p: THREE.Object3D | null = o; p && p !== level && !floor; p = p.parent) floor = p.userData.floor === true
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const key = `${mesh.geometry.uuid}|${mats.map((m) => m.uuid).join(',')}|${floor}`
        if (!buckets.has(key)) buckets.set(key, { mesh, floor, entries: [] })
        buckets.get(key)!.entries.push({ matrix: mesh.matrixWorld.clone(), wall, level: level.userData.level })
        moved.push(mesh)
      })
    }
    // Take the moved meshes out, then the holders they leave empty (wall groups stay).
    for (const m of moved) {
      let o: THREE.Object3D | null = m
      while (o && o !== level && !o.userData.wall && o.children.length === 0) {
        const parent: THREE.Object3D | null = o.parent
        o.removeFromParent()
        o = parent
      }
    }
  }
  const batch = new THREE.Group()
  batch.userData.batch = true
  root.add(batch)
  for (const [key, { mesh: first, floor, entries: list }] of buckets) {
    for (const e of list) {
      e.wall?.updateMatrix()
      const matrix = e.wall ? e.wall.matrix.clone().invert().multiply(e.matrix) : e.matrix
      out.push({ key, geometry: first.geometry, material: first.material, floor, level: e.level, wall: e.wall, matrix })
    }
    const mesh = new THREE.InstancedMesh(first.geometry, first.material, list.length)
    mesh.userData = { floor, noShadow: floor, levelCounts: prefixCounts(list.map((e) => e.level)) }
    list.forEach((e, i) => {
      mesh.setMatrixAt(i, e.matrix)
      if (e.wall) {
        e.wall.updateMatrix()
        const parts = wallParts.get(e.wall) ?? []
        parts.push({ mesh, index: i, local: e.wall.matrix.clone().invert().multiply(e.matrix) })
        wallParts.set(e.wall, parts)
      }
    })
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
    batch.add(mesh)
  }
  return batch
}

function place(template: THREE.Object3D, position: THREE.Vector3, yaw: number): THREE.Object3D {
  const o = template.clone()
  const holder = new THREE.Group()
  holder.add(o)
  holder.position.copy(position)
  holder.rotation.y = yaw
  return holder
}
