// Scene-tree view of a MapDocument (port of WorldView). Never writes to the document.
//   - Static props: one InstancedMesh per (cell, prop, part), where a cell is CELL x CELL
//     meters. Cells let three.js frustum-cull far-away groups; they're coarser than the 32 m
//     document chunks because every (cell, prop) pair costs draw calls in each pass.
//   - Skinned props (characters): individual animated clones. Animations advance at
//     ANIMATION_HZ (a stop-motion look that suits pixel art) and only while on screen.
//   - Props with a light, water bodies, buildings: individual objects.
//   - Furniture indoors (on a building's cells) is grouped apart and casts shadows only while the
//     cutaway opens the buildings up; under a roof its shadows can't be seen.
// Changes arrive per op (`changed`) or wholesale (`reset`); affected objects are refreshed on
// the next update(). Model loads are async, so each object carries a version and stale loads
// are dropped.
// Selection is shown by marks on the ground (editor/selection-marks.ts), not by tinting objects.

import * as THREE from 'three'
import { BuildingLayout, Vec3, type MapDocument, type MapObject } from '@pixel-arena/core'
import type { Library, PropDef } from '../library/library'
import { cloneAnimated, loadModel, placeholderParts, type Part } from '../library/models'
import { buildBuilding, cutWalls, setCutaway } from './building-visuals'
import { buildWater, waterTime } from './water'


/** Instancing cell size in meters (4 x 4 document chunks). */
const CELL = 128
const ANIMATION_HZ = 15

interface Group {
  key: string
  indoor: boolean
  parts: Part[]
  meshes: THREE.InstancedMesh[]
  ids: string[] // instance index -> object id
  dirtyBounds: boolean
}

interface Single {
  root: THREE.Object3D
  mixer?: THREE.AnimationMixer
}

export class WorldView {
  readonly root = new THREE.Group()
  private doc: MapDocument | null = null
  private groups = new Map<string, Group>()
  private slots = new Map<string, { group: Group; index: number }>()
  private singles = new Map<string, Single>()
  private versions = new Map<string, number>()
  private dirty = new Set<string>()
  private unbind: (() => void)[] = []
  private cutaway = -1
  private tmp = new THREE.Matrix4()
  private animationClock = 0
  private frustum = new THREE.Frustum()
  private sphere = new THREE.Sphere()
  constructor(private library: Library) {}

  /** Shows an object at a temporary transform without touching the document (drag preview). */
  preview(id: string, position: THREE.Vector3, yaw: number) {
    const obj = this.doc?.getObject(id)
    if (!obj) return
    const s = Number(obj.props.get('scale') ?? 1)
    const m = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s))
    const slot = this.slots.get(id)
    if (slot) {
      slot.group.parts.forEach((part, i) => {
        slot.group.meshes[i].setMatrixAt(slot.index, this.tmp.multiplyMatrices(m, part.matrix))
        slot.group.meshes[i].instanceMatrix.needsUpdate = true
      })
      slot.group.dirtyBounds = true
    }
    const single = this.singles.get(id)
    if (single) {
      single.root.position.copy(position)
      single.root.rotation.y = yaw
    }
  }

  /** Puts an object back where the document says it is (e.g. after a cancelled drag). */
  invalidate(id: string) {
    this.dirty.add(id)
  }

  bind(doc: MapDocument) {
    this.unbind.forEach((f) => f())
    this.doc = doc
    this.unbind = [
      doc.changed.connect((op) => {
        if (op.op === 'terrain') {
          // Water depth and grounded visuals don't depend on terrain except water's heightfield.
          for (const [id, s] of this.singles) if (s.root.userData.kind === 'water') this.dirty.add(id)
          return
        }
        this.dirty.add(op.id)
      }),
      doc.reset.connect(() => this.rebuild()),
    ]
    this.rebuild()
  }

  rebuild() {
    for (const id of [...this.slots.keys(), ...this.singles.keys()]) this.remove(id)
    for (const g of this.groups.values()) g.meshes.forEach((m) => this.root.remove(m))
    this.groups.clear()
    this.buildingCells.clear()
    for (const id of this.doc!.objects.keys()) this.dirty.add(id)
  }

  get cutawayLevel(): number {
    return this.cutaway
  }

  /** The scene node of a non-instanced object (building, water, animated prop), if loaded. */
  objectRoot(id: string): THREE.Object3D | undefined {
    return this.singles.get(id)?.root
  }

  /** Building level being edited (-1 = everything visible). */
  setCutaway(level: number) {
    // Furniture inside buildings shows only up to the cut level.
    if (level !== this.cutaway && this.doc)
      for (const o of this.doc.objects.values()) if (!o.deleted && o.type === 'prop' && this.buildingOf(o)) this.dirty.add(o.id)
    this.cutaway = level
    for (const g of this.groups.values()) if (g.indoor) g.meshes.forEach((m) => (m.castShadow = level >= 0))
    for (const s of this.singles.values()) if (s.root.userData.kind === 'building') setCutaway(s.root, level)
    this.cutKey = ''
  }

  /** The view direction the walls were last cut for (cutWalls), and the level. */
  private cutKey = ''
  private viewDir = new THREE.Vector3(-1, -1, -1)

  /** A wall kept standing while cut away: the one being edited (building id, edge). */
  private wallFocus: { id: string; edge: string } | null = null
  setWallFocus(focus: { id: string; edge: string } | null) {
    if (focus?.id === this.wallFocus?.id && focus?.edge === this.wallFocus?.edge) return
    this.wallFocus = focus
    this.cutKey = ''
  }

  /** Re-cuts walls when the level, the view's heading (in 45° steps) or the focused wall changes. */
  private updateWallCuts(camera?: THREE.Camera) {
    if (camera) camera.getWorldDirection(this.viewDir)
    const key = `${this.cutaway}:${Math.round(Math.atan2(this.viewDir.x, this.viewDir.z) / (Math.PI / 4))}:${this.wallFocus?.id}:${this.wallFocus?.edge}`
    if (key === this.cutKey) return
    this.cutKey = key
    for (const [id, s] of this.singles) {
      if (s.root.userData.kind !== 'building') continue
      cutWalls(s.root, this.cutaway, this.viewDir, this.wallFocus?.id === id ? this.wallFocus.edge : '')
    }
  }

  update(dt: number, camera?: THREE.Camera) {
    waterTime.value += dt
    this.updateWallCuts(camera)
    if (this.dirty.size) {
      const ids = [...this.dirty]
      this.dirty.clear()
      for (const id of ids) void this.refresh(id)
    }
    for (const g of this.groups.values()) {
      if (!g.dirtyBounds) continue
      g.dirtyBounds = false
      for (const m of g.meshes) m.computeBoundingSphere()
    }
    this.animationClock += dt
    if (this.animationClock >= 1 / ANIMATION_HZ) {
      const step = this.animationClock
      this.animationClock = 0
      if (camera) this.frustum.setFromProjectionMatrix(this.tmp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      for (const s of this.singles.values()) {
        if (!s.mixer) continue
        this.sphere.set(s.root.position, 2.5)
        if (!camera || this.frustum.intersectsSphere(this.sphere)) s.mixer.update(step)
      }
    }
  }

  /** Nearest map object hit by a ray (instanced or single), skipping `exclude` ids. */
  pick(raycaster: THREE.Raycaster, exclude: Set<string> = new Set()): { id: string; point: THREE.Vector3; normal: THREE.Vector3; distance: number; floor: boolean } | null {
    const targets: THREE.Object3D[] = []
    for (const g of this.groups.values()) targets.push(...g.meshes)
    for (const s of this.singles.values()) targets.push(s.root)
    const normalMatrix = new THREE.Matrix3()
    for (const hit of raycaster.intersectObjects(targets, true)) {
      let id: string | undefined
      const world = new THREE.Matrix4()
      const mesh = hit.object as THREE.InstancedMesh
      if (mesh.isInstancedMesh && hit.instanceId !== undefined) {
        // Props: the group knows each instance's object; building pieces: the building's.
        const group = mesh.userData.group as Group | undefined
        if (group) id = group.ids[hit.instanceId]
        else for (let o: THREE.Object3D | null = hit.object; o && !id; o = o.parent) id = o.userData.objectId
        mesh.getMatrixAt(hit.instanceId, world)
        world.premultiply(mesh.matrixWorld)
      } else {
        for (let o: THREE.Object3D | null = hit.object; o && !id; o = o.parent) id = o.userData.objectId
        world.copy(hit.object.matrixWorld)
      }
      if (!id || exclude.has(id) || !shown(hit.object)) continue
      const normal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().applyMatrix3(normalMatrix.getNormalMatrix(world)).normalize()
      let floor = false
      for (let o: THREE.Object3D | null = hit.object; o && !floor; o = o.parent) floor = o.userData.floor === true
      return { id, point: hit.point.clone(), normal, distance: hit.distance, floor }
    }
    return null
  }

  stats() {
    let instanced = 0
    for (const g of this.groups.values()) instanced += g.ids.length
    return { instanced, singles: this.singles.size, groups: this.groups.size }
  }

  /** True while model loads or refreshes are still pending. */
  get busy(): boolean {
    return this.dirty.size > 0 || this.loading > 0
  }

  private loading = 0

  private async refresh(id: string) {
    const version = (this.versions.get(id) ?? 0) + 1
    this.versions.set(id, version)
    this.buildingCells.delete(id)
    const obj = this.doc!.getObject(id)
    const pos = obj?.props.get('position')
    if (!obj || obj.deleted || !(pos instanceof Vec3) || !['prop', 'water', 'building'].includes(obj.type)) {
      this.remove(id)
      return
    }
    this.loading++
    try {
      const next = await this.makeVisual(obj)
      if (this.versions.get(id) !== version) return // a newer refresh took over
      this.remove(id)
      if (next === null) return
      if ('parts' in next) this.addInstance(id, obj, next.parts, next.propId)
      else {
        this.place(next.root, obj)
        next.root.userData.objectId = id
        this.root.add(next.root)
        this.singles.set(id, next)
      }
    } finally {
      this.loading--
    }
  }

  private async makeVisual(obj: MapObject): Promise<Single | { parts: Part[]; propId: string } | null> {
    if (obj.type === 'water') {
      const mesh = buildWater(obj, this.doc!)
      if (!mesh) return null
      mesh.userData.kind = 'water'
      return { root: mesh }
    }
    if (obj.type === 'building') {
      const root = await buildBuilding(obj, this.library)
      root.userData.kind = 'building'
      root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = !o.userData.noShadow), (o.receiveShadow = true)) : null))
      setCutaway(root, this.cutaway)
      this.cutKey = '' // cut the new walls on the next update
      return { root }
    }
    if (this.cutAway(obj)) return null
    const propId = String(obj.props.get('prop') ?? '')
    const prop: PropDef | undefined = this.library.props.get(propId)
    const model = prop ? await loadModel(prop).catch(() => null) : null
    if (!prop || !model) return { parts: placeholderParts(propId), propId: `missing:${propId}` }
    if (model.skinned || prop.light) {
      let root: THREE.Object3D
      let mixer: THREE.AnimationMixer | undefined
      if (model.skinned) ({ root, mixer } = cloneAnimated(model, Number(obj.props.get('anim_offset') ?? 0)))
      else root = model.scene.clone()
      const holder = new THREE.Group()
      holder.add(root)
      if (prop.light) {
        const light = new THREE.PointLight(prop.light.color ?? '#ffffff', (prop.light.energy ?? 1) * 6, (prop.light.range ?? 5) * 1.5, 1.5)
        light.position.y = Math.min(prop.height * 0.5, 1)
        holder.add(light)
      }
      return { root: holder, mixer }
    }
    return { parts: model.parts, propId: prop.id }
  }

  /** The building an object sits in (its nearest building ancestor), if any. */
  private buildingOf(obj: MapObject): MapObject | null {
    let cur = obj
    for (let guard = 0; guard < 64; guard++) {
      const parent = cur.props.get('parent')
      const p = typeof parent === 'string' ? this.doc!.getObject(parent) : undefined
      if (!p || p.deleted) return null
      if (p.type === 'building') return p
      cur = p
    }
    return null
  }

  /** Hidden by the cutaway: inside a building, on a level above the one being viewed. */
  private cutAway(obj: MapObject): boolean {
    if (this.cutaway < 0) return false
    const b = this.buildingOf(obj)
    if (!b) return false
    const h = this.library.kits.get(String(b.props.get('kit') ?? ''))?.wallHeight ?? 3
    const by = (b.props.get('position') as Vec3 | undefined)?.y ?? 0
    const y = (obj.props.get('position') as Vec3 | undefined)?.y ?? 0
    return y >= by + (this.cutaway + 1) * h - 0.1
  }

  private place(o: THREE.Object3D, obj: MapObject) {
    const p = obj.props.get('position') as Vec3
    o.position.set(p.x, p.y, p.z)
    o.rotation.set(0, Number(obj.props.get('rotation') ?? 0), 0)
    o.scale.setScalar(Number(obj.props.get('scale') ?? 1))
  }

  private matrixOf(obj: MapObject): THREE.Matrix4 {
    const p = obj.props.get('position') as Vec3
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(obj.props.get('rotation') ?? 0))
    const s = Number(obj.props.get('scale') ?? 1)
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, s, s))
  }

  /** Whether a prop stands on one of its building's cells. */
  private indoor(obj: MapObject): boolean {
    const b = this.buildingOf(obj)
    if (!b) return false
    let cells = this.buildingCells.get(b.id)
    if (!cells) {
      const layout = BuildingLayout.fromObject(b)
      cells = new Set(layout.levelIndices().flatMap((l) => [...layout.cells(l).keys()].map((k) => `${l}:${k}`)))
      this.buildingCells.set(b.id, cells)
    }
    const kit = this.library.kits.get(String(b.props.get('kit') ?? ''))
    const cs = kit?.cellSize ?? 3
    const h = kit?.wallHeight ?? 3
    const bp = (b.props.get('position') as Vec3 | undefined) ?? new Vec3(0, 0, 0)
    const p = obj.props.get('position') as Vec3
    const yaw = Number(b.props.get('rotation') ?? 0)
    const dx = p.x - bp.x
    const dz = p.z - bp.z
    const x = dx * Math.cos(yaw) - dz * Math.sin(yaw)
    const z = dx * Math.sin(yaw) + dz * Math.cos(yaw)
    const level = Math.floor((p.y - bp.y) / h + 0.01)
    return cells.has(`${level}:${Math.floor(x / cs)},${Math.floor(z / cs)}`)
  }
  /** Building id -> "level:i,j" of its cells (indoor()); dropped when the building changes. */
  private buildingCells = new Map<string, Set<string>>()

  private addInstance(id: string, obj: MapObject, parts: Part[], propId: string) {
    const p = obj.props.get('position') as Vec3
    const indoor = this.indoor(obj)
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}|${propId}${indoor ? '|in' : ''}`
    let g = this.groups.get(key)
    if (!g) {
      g = { key, indoor, parts, meshes: [], ids: [], dirtyBounds: true }
      this.groups.set(key, g)
      this.grow(g, 8)
    }
    if (g.ids.length === g.meshes[0].instanceMatrix.count) this.grow(g, g.ids.length * 2)
    const index = g.ids.length
    g.ids.push(id)
    const m = this.matrixOf(obj)
    g.parts.forEach((part, i) => {
      const mesh = g!.meshes[i]
      mesh.setMatrixAt(index, this.tmp.multiplyMatrices(m, part.matrix))
      mesh.count = g!.ids.length
      mesh.instanceMatrix.needsUpdate = true
    })
    g.dirtyBounds = true
    this.slots.set(id, { group: g, index })
  }

  private remove(id: string) {
    const single = this.singles.get(id)
    if (single) {
      this.root.remove(single.root)
      single.root.userData.dispose?.()
      this.singles.delete(id)
    }
    const slot = this.slots.get(id)
    if (!slot) return
    // Swap-remove: move the last instance into the freed index.
    const g = slot.group
    const last = g.ids.length - 1
    if (slot.index !== last) {
      const movedId = g.ids[last]
      g.ids[slot.index] = movedId
      for (const mesh of g.meshes) {
        mesh.getMatrixAt(last, this.tmp)
        mesh.setMatrixAt(slot.index, this.tmp)
      }
      this.slots.set(movedId, { group: g, index: slot.index })
    }
    g.ids.pop()
    for (const mesh of g.meshes) {
      mesh.count = g.ids.length
      mesh.instanceMatrix.needsUpdate = true
    }
    g.dirtyBounds = true
    this.slots.delete(id)
    if (g.ids.length === 0) {
      g.meshes.forEach((m) => this.root.remove(m))
      this.groups.delete(g.key)
    }
  }

  private grow(g: Group, capacity: number) {
    g.parts.forEach((part, i) => {
      const next = new THREE.InstancedMesh(part.geometry, part.material, capacity)
      next.userData.group = g
      next.castShadow = !g.indoor || this.cutaway >= 0
      next.receiveShadow = true
      next.count = g.ids.length
      const old = g.meshes[i]
      if (old) {
        next.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, g.ids.length * 16))
        this.root.remove(old)
        old.dispose()
      }
      g.meshes[i] = next
      this.root.add(next)
    })
    g.dirtyBounds = true
  }
}

/** Visible itself and in every parent (hidden building levels hide their pieces). */
function shown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}
