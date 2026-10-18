// Implicit terrain: a large flat plane at height 0 (material 0) following the camera focus,
// with holes cut where edited terrain chunks render their own meshes (port of Ground).

import * as THREE from 'three'
import { CHUNK_SIZE, Vec2i } from '@pixel-arena/core'
import { terrainMaterial } from './terrain-shading'
import { addGroundGrid } from './grid'

const SIZE = 4096
const MASK = 160 // chunks per side covered by the hole mask

export class Ground {
  readonly mesh: THREE.Mesh
  private maskData = new Uint8Array(MASK * MASK)
  private mask = new THREE.DataTexture(this.maskData, MASK, MASK, THREE.RedFormat, THREE.UnsignedByteType)
  private origin = { value: new THREE.Vector2(0, 0) }
  private holes: Vec2i[] = []
  private center = new Vec2i(1 << 30, 0)

  constructor() {
    const mat = terrainMaterial(
      'uniform sampler2D uHoles;\nuniform vec2 uHoleOrigin;',
      `ivec2 chunk = ivec2(floor(vWorld.xz / ${CHUNK_SIZE}.0)) - ivec2(uHoleOrigin);
if (all(greaterThanEqual(chunk, ivec2(0))) && all(lessThan(chunk, ivec2(${MASK}))) && texelFetch(uHoles, chunk, 0).r > 0.5) discard;
base = materialColor(0, vWorld.xz, dxz, dyz);`,
      { uHoles: { value: this.mask }, uHoleOrigin: this.origin },
    )
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), mat)
    this.mesh.receiveShadow = true
    addGroundGrid(this.mesh, CHUNK_SIZE, MASK, { uHoles: { value: this.mask }, uHoleOrigin: this.origin })
  }

  /** Re-center under `focus`, snapped to whole chunks. */
  follow(focus: THREE.Vector3) {
    const cx = Math.round(focus.x / CHUNK_SIZE)
    const cz = Math.round(focus.z / CHUNK_SIZE)
    this.mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)
    if (cx !== this.center.x || cz !== this.center.y) {
      this.center = new Vec2i(cx, cz)
      this.updateMask()
    }
  }

  /** Chunks to cut out (those with edited terrain). */
  setHoles(chunks: Vec2i[]) {
    this.holes = chunks
    this.updateMask()
  }

  private updateMask() {
    const ox = this.center.x - MASK / 2
    const oz = this.center.y - MASK / 2
    this.maskData.fill(0)
    for (const c of this.holes) {
      const x = c.x - ox
      const z = c.y - oz
      if (x >= 0 && z >= 0 && x < MASK && z < MASK) this.maskData[z * MASK + x] = 255
    }
    this.mask.needsUpdate = true
    this.origin.value.set(ox, oz)
  }
}
