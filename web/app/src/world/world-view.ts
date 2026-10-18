// Scene-tree view of a MapDocument (port of WorldView). Never writes to the document.
//   - Static props: one InstancedMesh per (cell, prop, part), where a cell is CELL x CELL
//     meters. Cells let three.js frustum-cull far-away groups; they're coarser than the 32 m
//     document chunks because every (cell, prop) pair costs draw calls in each pass.
//   - Skinned props (characters): individual animated clones. Animations advance at
//     ANIMATION_HZ (a stop-motion look that suits pixel art) and only while on screen.
//   - Props with a light, water bodies, buildings: individual objects.
// Changes arrive per op (`changed`) or wholesale (`reset`); affected objects are refreshed on
// the next update(). Model loads are async, so each object carries a version and stale loads
// are dropped.
// Selected objects get a highlight proxy: copies of their meshes with an additive rim shader,
// drawn over the object (instances can't take a per-instance material overlay).

import * as THREE from 'three'
import { Vec3, type MapDocument, type MapObject } from '@pixel-arena/core'
import type { Library, PropDef } from '../library/library'
import { cloneAnimated, loadModel, placeholderParts, type Part } from '../library/models'
import { buildBuilding, setCutaway } from './building-visuals'
import { buildWater, waterTime } from './water'

const HIGHLIGHT = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color('#ffbf33') } },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    varying vec3 vNormal;
    void main() {
      // Edge light only (the ring or outline under it marks the selection; selection-marks.ts).
      float rim = pow(1.0 - clamp(abs(vNormal.z), 0.0, 1.0), 2.0);
      gl_FragColor = vec4(color * (0.06 + rim * 0.7), 1.0);
    }`,
  blending: THREE.AdditiveBlending,
  transparent: true, // draw after the opaque objects it sits on
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})

/** Instancing cell size in meters (4 x 4 document chunks). */
const CELL = 128
const ANIMATION_HZ = 15

interface Group {
  key: string
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
  private highlighted = new Set<string>()
  private proxies = new Map<string, THREE.Object3D>()
  readonly highlightRoot = new THREE.Group()

  constructor(private library: Library) {
    this.highlightRoot.userData.overlay = true // not in exports
    this.root.add(this.highlightRoot)
  }

  /** Highlights exactly these objects. */
  setHighlights(ids: Iterable<string>) {
    const wanted = new Set(ids)
    for (const id of this.highlighted) if (!wanted.has(id)) this.dropProxy(id)
    this.highlighted = wanted
    for (const id of wanted) this.updateProxy(id)
  }

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
    this.updateProxy(id)
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
    for (const id of [...this.proxies.keys()]) this.dropProxy(id)
    this.highlighted.clear()
    for (const g of this.groups.values()) g.meshes.forEach((m) => this.root.remove(m))
    this.groups.clear()
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
    this.cutaway = level
    for (const s of this.singles.values()) if (s.root.userData.kind === 'building') setCutaway(s.root, level)
  }

  update(dt: number, camera?: THREE.Camera) {
    waterTime.value += dt
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
  pick(raycaster: THREE.Raycaster, exclude: Set<string> = new Set()): { id: string; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
    const targets: THREE.Object3D[] = []
    for (const g of this.groups.values()) targets.push(...g.meshes)
    for (const s of this.singles.values()) targets.push(s.root)
    const normalMatrix = new THREE.Matrix3()
    for (const hit of raycaster.intersectObjects(targets, true)) {
      let id: string | undefined
      const world = new THREE.Matrix4()
      const mesh = hit.object as THREE.InstancedMesh
      if (mesh.isInstancedMesh && hit.instanceId !== undefined) {
        id = (mesh.userData.group as Group).ids[hit.instanceId]
        mesh.getMatrixAt(hit.instanceId, world)
        world.premultiply(mesh.matrixWorld)
      } else {
        for (let o: THREE.Object3D | null = hit.object; o && !id; o = o.parent) id = o.userData.objectId
        world.copy(hit.object.matrixWorld)
      }
      if (!id || exclude.has(id) || !hit.object.visible) continue
      const normal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().applyMatrix3(normalMatrix.getNormalMatrix(world)).normalize()
      return { id, point: hit.point.clone(), normal, distance: hit.distance }
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
    const obj = this.doc!.getObject(id)
    const pos = obj?.props.get('position')
    if (!obj || obj.deleted || !(pos instanceof Vec3) || !['prop', 'water', 'building'].includes(obj.type)) {
      this.remove(id)
      this.dropProxy(id)
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
      this.updateProxy(id)
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
      root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null))
      setCutaway(root, this.cutaway)
      return { root }
    }
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

  private updateProxy(id: string) {
    this.dropProxy(id)
    if (!this.highlighted.has(id)) return
    const proxy = new THREE.Group()
    const slot = this.slots.get(id)
    if (slot) {
      slot.group.parts.forEach((part, i) => {
        const mesh = new THREE.Mesh(part.geometry, HIGHLIGHT)
        mesh.matrixAutoUpdate = false
        slot.group.meshes[i].getMatrixAt(slot.index, mesh.matrix)
        proxy.add(mesh)
      })
    }
    const single = this.singles.get(id)
    if (single) {
      single.root.updateMatrixWorld(true)
      single.root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || !o.visible) return
        const mesh = new THREE.Mesh(m.geometry, HIGHLIGHT)
        mesh.matrixAutoUpdate = false
        mesh.matrix.copy(m.matrixWorld)
        proxy.add(mesh)
      })
    }
    if (proxy.children.length === 0) return
    proxy.traverse((o) => (o.raycast = () => {})) // never pickable
    this.proxies.set(id, proxy)
    this.highlightRoot.add(proxy)
  }

  private dropProxy(id: string) {
    const p = this.proxies.get(id)
    if (p) {
      this.highlightRoot.remove(p)
      this.proxies.delete(id)
    }
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

  private addInstance(id: string, obj: MapObject, parts: Part[], propId: string) {
    const p = obj.props.get('position') as Vec3
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}|${propId}`
    let g = this.groups.get(key)
    if (!g) {
      g = { key, parts, meshes: [], ids: [], dirtyBounds: true }
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
      next.castShadow = true
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
