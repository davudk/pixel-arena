// Renders edited terrain: one mesh per stored chunk (the Ground plane covers the rest). Terrain
// ops mark the chunk and its neighbours dirty (normals and material borders read across
// edges); dirty chunks rebuild once per frame. Port of TerrainView.

import * as THREE from 'three'
import { terrainChunk, terrainEdit, Vec2i, type MapDocument, type TerrainChunk } from '@pixel-arena/core'
import { CLIFF, terrainMaterial } from './terrain-shading'
import { addTerrainGrid, syncGrid } from './grid'

const N = terrainChunk.SIZE
const S = terrainChunk.SAMPLES

export class TerrainView {
  readonly root = new THREE.Group()
  /** Called with the stored chunk coordinates whenever the set changes (for Ground holes). */
  onChunksChanged: (chunks: Vec2i[]) => void = () => {}
  private doc: MapDocument | null = null
  private meshes = new Map<string, THREE.Mesh>()
  private dirty = new Set<string>()
  private keysChanged = false
  private unbind: (() => void)[] = []

  bind(doc: MapDocument) {
    this.unbind.forEach((f) => f())
    this.doc = doc
    this.unbind = [
      doc.changed.connect((op) => {
        if (op.op !== 'terrain') return
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.dirty.add(op.chunk.add(new Vec2i(dx, dz)).key)
        this.keysChanged = true
      }),
      doc.reset.connect(() => this.rebuild()),
    ]
    this.rebuild()
  }

  rebuild() {
    for (const m of this.meshes.values()) this.dispose(m)
    this.meshes.clear()
    for (const k of this.doc!.terrain.keys()) this.dirty.add(k)
    this.keysChanged = true
    this.flush()
  }

  flush() {
    const doc = this.doc
    if (!doc) return
    for (const key of this.dirty) {
      const chunk = doc.terrain.get(key)
      if (chunk) this.build(chunk)
      else if (this.meshes.has(key)) {
        this.dispose(this.meshes.get(key)!)
        this.meshes.delete(key)
      }
    }
    this.dirty.clear()
    if (this.keysChanged) {
      this.keysChanged = false
      this.onChunksChanged([...doc.terrain.values()].map((c) => c.coord))
    }
  }

  private build(chunk: TerrainChunk) {
    let mesh = this.meshes.get(chunk.coord.key)
    const materials = this.materialTexture(chunk.coord)
    if (!mesh) {
      const uniforms = { uMaterials: { value: materials }, uChunkOrigin: { value: new THREE.Vector2(chunk.coord.x * N, chunk.coord.y * N) } }
      const mat = terrainMaterial(
        'uniform sampler2D uMaterials;\nuniform vec2 uChunkOrigin;',
        // Dithered transitions: pick one of the four surrounding cells with probability = its
        // bilinear weight, in 25 cm blocks (built surfaces keep crisp cell edges); steep slopes
        // turn to the cliff material.
        `vec2 u = vWorld.xz - uChunkOrigin - 0.5;
ivec2 c = ivec2(floor(u));
vec2 f = fract(u);
float r = hash12(floor(vWorld.xz * 4.0));
float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y;
ivec2 pick = c + ivec2(1, 1);
if (r < w00) pick = c; else if (r < w00 + w10) pick = c + ivec2(1, 0); else if (r < w00 + w10 + w01) pick = c + ivec2(0, 1);
int m = int(texelFetch(uMaterials, pick + ivec2(1), 0).r * 255.0 + 0.5);
// Built surfaces keep crisp cell edges: inside one, or where the dither would spill one out.
int own = int(texelFetch(uMaterials, ivec2(floor(vWorld.xz - uChunkOrigin)) + ivec2(1), 0).r * 255.0 + 0.5);
if (hardEdged(own) || hardEdged(m)) m = own;
base = materialColor(m, vWorld.xz, dxz, dyz);
float steep = 1.0 - smoothstep(0.55, 0.7, vWorldNormal.y);
if (hash12(floor(vWorld.xz * 4.0) + 17.0) < steep) base = materialColor(${CLIFF}, vWorld.xz, dxz, dyz);`,
        uniforms,
      )
      mat.userData.uniforms = uniforms
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
      mesh.position.set(chunk.coord.x * N, 0, chunk.coord.y * N)
      mesh.receiveShadow = true
      mesh.castShadow = true
      addTerrainGrid(mesh)
      this.meshes.set(chunk.coord.key, mesh)
      this.root.add(mesh)
    } else {
      const u = (mesh.material as THREE.Material).userData.uniforms
      u.uMaterials.value.dispose()
      u.uMaterials.value = materials
      mesh.geometry.dispose()
    }
    mesh.geometry = buildGeometry(this.doc!, chunk)
    syncGrid(mesh)
  }

  /** (N+2)^2 material indices: the chunk's cells plus a one-cell border from its neighbours. */
  private materialTexture(coord: Vec2i): THREE.DataTexture {
    const w = N + 2
    const data = new Uint8Array(w * w)
    for (let z = -1; z <= N; z++)
      for (let x = -1; x <= N; x++) data[(z + 1) * w + x + 1] = terrainEdit.materialAt(this.doc!, coord.x * N + x, coord.y * N + z)
    const tex = new THREE.DataTexture(data, w, w, THREE.RedFormat, THREE.UnsignedByteType)
    tex.needsUpdate = true
    return tex
  }

  private dispose(m: THREE.Mesh) {
    this.root.remove(m)
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
}

/** Heightfield geometry for a chunk in chunk-local coordinates; normals read neighbours. */
export function buildGeometry(doc: MapDocument, chunk: TerrainChunk): THREE.BufferGeometry {
  const pos = new Float32Array(S * S * 3)
  const nor = new Float32Array(S * S * 3)
  const bx = chunk.coord.x * N
  const bz = chunk.coord.y * N
  const h = (x: number, z: number) => terrainEdit.heightAt(doc, x, z)
  const n = new THREE.Vector3()
  for (let z = 0; z < S; z++)
    for (let x = 0; x < S; x++) {
      const i = z * S + x
      pos.set([x, chunk.heights[i], z], i * 3)
      n.set(-(h(bx + x + 1, bz + z) - h(bx + x - 1, bz + z)), 2, -(h(bx + x, bz + z + 1) - h(bx + x, bz + z - 1))).normalize()
      nor.set([n.x, n.y, n.z], i * 3)
    }
  const index = new Uint32Array(N * N * 6)
  let k = 0
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const a = z * S + x
      const b = a + 1
      const c = a + S
      const d = c + 1
      index.set([a, c, b, b, c, d], k) // counter-clockwise seen from above (three.js front face)
      k += 6
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.computeBoundingSphere()
  return g
}
