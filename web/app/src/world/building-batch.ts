// Draws every building on the map together, so the draw calls don't grow with the number of
// buildings: one InstancedMesh per kit piece (geometry, material), one merged mesh per room floor
// material, one for all foundations and one for all roofs. Everything is ordered by level, so
// the cutaway draws a prefix of each (levelCounts), like a single building does on its own
// (building-visuals.ts).
//
// add() takes a building's parts (partsOf) and strips its scene down to handles: the level and
// wall groups (cutWalls() still scales those) and empty roof groups (setCutaway() still toggles
// those). Any change (a building added, removed, moved or its walls cut) marks the batch dirty;
// update() rebuilds it, which is cheap next to drawing the pieces one building at a time.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { partsOf, type PiecePart } from './building-visuals'

interface Member {
  root: THREE.Object3D
  pieces: PiecePart[]
  plates: { material: THREE.Material; level: number; geometry: THREE.BufferGeometry }[]
  foundation: THREE.BufferGeometry | null
  roofs: { level: number; geometry: THREE.BufferGeometry }[]
}

/** A merged mesh's triangles by building: [end vertex, building id], in order. */
type Ranges = [number, string][]

export class BuildingBatch {
  readonly root = new THREE.Group()
  private members = new Map<string, Member>()
  private dirty = false
  private cutaway = -1
  private pieces = new Map<string, THREE.InstancedMesh>()
  private merged: THREE.Mesh[] = []
  private tmp = new THREE.Matrix4()
  /** Foundations' and roofs' shared vertex-colored material. */
  private vcMaterial: THREE.Material | null = null

  /** Takes over drawing the building `root` (just built by buildBuilding). */
  add(id: string, root: THREE.Object3D) {
    const p = partsOf(root)
    if (!p) return
    const vc = p.foundation ?? p.roofs[0]
    if (vc) this.vcMaterial = vc.material as THREE.Material
    p.batch.removeFromParent()
    p.foundation?.removeFromParent()
    for (const r of p.roofs) {
      // An empty handle keeps the roof's level for setCutaway (and the self-tests).
      const handle = new THREE.Group()
      handle.userData.roofLevel = r.userData.roofLevel
      handle.visible = r.visible
      r.parent?.add(handle)
      r.removeFromParent()
    }
    p.batch.traverse((o) => {
      const m = o as THREE.InstancedMesh
      if (m.isInstancedMesh) m.dispose()
    })
    this.members.set(id, {
      root,
      pieces: p.pieces,
      plates: p.plates,
      foundation: p.foundation?.geometry ?? null,
      roofs: p.roofs.map((r) => ({ level: r.userData.roofLevel as number, geometry: r.geometry })),
    })
    this.dirty = true
  }

  remove(id: string) {
    const m = this.members.get(id)
    if (!m) return
    this.members.delete(id)
    m.plates.forEach((p) => p.geometry.dispose())
    m.foundation?.dispose()
    m.roofs.forEach((r) => r.geometry.dispose())
    this.dirty = true
  }

  has(id: string): boolean {
    return this.members.has(id)
  }

  /** A building moved, or its walls were cut. */
  invalidate() {
    this.dirty = true
  }

  get size(): number {
    return this.members.size
  }

  setCutaway(level: number) {
    this.cutaway = level
    for (const m of [...this.pieces.values(), ...this.merged]) applyCut(m, level)
  }

  /** Meshes to raycast (picking). */
  get meshes(): THREE.Mesh[] {
    return [...this.pieces.values(), ...this.merged]
  }

  /** The building a hit belongs to, and whether it hit a floor. */
  hitOf(hit: THREE.Intersection): { id: string; floor: boolean } | null {
    const mesh = hit.object as THREE.Mesh
    const floor = mesh.userData.floor === true
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const id = (mesh.userData.ids as string[] | undefined)?.[hit.instanceId ?? -1]
      return id ? { id, floor } : null
    }
    const ranges = mesh.userData.ranges as Ranges | undefined
    if (!ranges || hit.faceIndex == null) return null
    const vertex = hit.faceIndex * 3
    for (const [end, id] of ranges) if (vertex < end) return { id, floor }
    return null
  }

  update() {
    if (!this.dirty) return
    this.dirty = false
    for (const m of this.members.values()) m.root.updateMatrix()
    this.rebuildPieces()
    for (const m of this.merged) {
      m.geometry.dispose()
      this.root.remove(m)
    }
    this.merged = []
    // Room floors, per material; foundations; roofs (shown below the cut level, so their
    // "level" for the prefix is one up).
    const plates = new Map<THREE.Material, { level: number; geometry: THREE.BufferGeometry; root: THREE.Object3D; id: string }[]>()
    const vertexColored: { level: number; geometry: THREE.BufferGeometry; root: THREE.Object3D; id: string }[] = []
    const roofs: typeof vertexColored = []
    for (const [id, m] of this.members) {
      for (const p of m.plates) {
        if (!plates.has(p.material)) plates.set(p.material, [])
        plates.get(p.material)!.push({ level: p.level, geometry: p.geometry, root: m.root, id })
      }
      if (m.foundation) vertexColored.push({ level: -1, geometry: m.foundation, root: m.root, id })
      for (const r of m.roofs) roofs.push({ level: r.level + 1, geometry: r.geometry, root: m.root, id })
    }
    for (const [material, list] of plates) this.addMerged(list, material, { floor: true, noShadow: true })
    if (this.vcMaterial) {
      this.addMerged(vertexColored, this.vcMaterial, {})
      this.addMerged(roofs, this.vcMaterial, {})
    }
    this.setCutaway(this.cutaway)
  }

  private rebuildPieces() {
    const byKey = new Map<string, { part: PiecePart; id: string; root: THREE.Object3D }[]>()
    for (const [id, m] of this.members)
      for (const part of m.pieces) {
        if (!byKey.has(part.key)) byKey.set(part.key, [])
        byKey.get(part.key)!.push({ part, id, root: m.root })
      }
    for (const [key, mesh] of this.pieces)
      if (!byKey.has(key)) {
        this.root.remove(mesh)
        mesh.dispose()
        this.pieces.delete(key)
      }
    for (const [key, list] of byKey) {
      list.sort((a, b) => a.part.level - b.part.level)
      let mesh = this.pieces.get(key)
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          this.root.remove(mesh)
          mesh.dispose()
        }
        const first = list[0].part
        mesh = new THREE.InstancedMesh(first.geometry, first.material, Math.ceil(list.length * 1.25))
        mesh.castShadow = !first.floor
        mesh.receiveShadow = true
        mesh.userData.floor = first.floor
        this.pieces.set(key, mesh)
        this.root.add(mesh)
      }
      list.forEach(({ part, root }, i) => {
        if (part.wall) this.tmp.multiplyMatrices(root.matrix, part.wall.matrix).multiply(part.matrix)
        else this.tmp.multiplyMatrices(root.matrix, part.matrix)
        mesh!.setMatrixAt(i, this.tmp)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.userData.ids = list.map((e) => e.id)
      mesh.userData.levelCounts = prefixCounts(list.map((e) => e.part.level))
      mesh.boundingSphere = null
      mesh.boundingBox = null
    }
  }

  /** One mesh of `list` (in its buildings' places), ordered by level. */
  private addMerged(list: { level: number; geometry: THREE.BufferGeometry; root: THREE.Object3D; id: string }[], material: THREE.Material, userData: Record<string, unknown>) {
    if (!list.length) return
    list.sort((a, b) => a.level - b.level)
    const geometries: THREE.BufferGeometry[] = []
    const ranges: Ranges = []
    const levels: number[] = []
    let vertices = 0
    for (const e of list) {
      const g = (e.geometry.index ? e.geometry.toNonIndexed() : e.geometry.clone()).applyMatrix4(e.root.matrix)
      geometries.push(g)
      vertices += g.attributes.position.count
      ranges.push([vertices, e.id])
      levels.push(e.level)
    }
    const geometry = mergeGeometries(geometries)
    geometries.forEach((g) => g.dispose())
    if (!geometry) return
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = !userData.noShadow
    mesh.receiveShadow = true
    // [level, vertices up to and including that level].
    const counts: [number, number][] = []
    ranges.forEach(([end], i) => {
      if (counts.length && counts[counts.length - 1][0] === levels[i]) counts[counts.length - 1][1] = end
      else counts.push([levels[i], end])
    })
    mesh.userData = { ...userData, ranges, levelCounts: counts }
    this.merged.push(mesh)
    this.root.add(mesh)
  }
}

function applyCut(m: THREE.Mesh, level: number) {
  const counts = m.userData.levelCounts as [number, number][] | undefined
  if (!counts) return
  let n = 0
  for (const [l, c] of counts) if (level < 0 || l <= level) n = c
  const inst = m as THREE.InstancedMesh
  if (inst.isInstancedMesh) {
    inst.count = n
    inst.boundingSphere = null
  } else m.geometry.setDrawRange(0, n)
  m.visible = n > 0
}

function prefixCounts(levels: number[]): [number, number][] {
  const out: [number, number][] = []
  levels.forEach((l, i) => {
    if (out.length && out[out.length - 1][0] === l) out[out.length - 1][1] = i + 1
    else out.push([l, i + 1])
  })
  return out
}
