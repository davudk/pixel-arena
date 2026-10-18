// Procedural roofs over a rectangle (building-local meters): gable or hip with the ridge along
// the longer side, or a flat slab; plus boxes for foundations. Port of RoofMesh. Geometry is
// non-indexed with vertex colors and flat normals facing away from the shape's center; winding
// follows the normal (three.js front faces are counter-clockwise).

import * as THREE from 'three'

const OVERHANG = 0.35
const PITCH = 0.75 // rise per unit of horizontal run

type V = THREE.Vector3
type Tri = [V, V, V, THREE.Color]

export class MeshBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []

  add(a: V, b: V, c: V, color: THREE.Color, center: V) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const outward = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3).sub(center)
    if (n.dot(outward) < 0) {
      ;[b, c] = [c, b]
      n.negate()
    }
    n.normalize()
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z)
      this.nor.push(n.x, n.y, n.z)
      this.col.push(color.r, color.g, color.b)
    }
  }

  box(lo: V, hi: V, color: THREE.Color) {
    const center = lo.clone().add(hi).multiplyScalar(0.5)
    for (const t of boxTris(lo, hi, color)) this.add(t[0], t[1], t[2], t[3], center)
  }

  get empty(): boolean {
    return this.pos.length === 0
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    return g
  }
}

/** Adds a roof over `rect` (x/y = local x/z) with its base at `baseY`. */
export function addRoof(mb: MeshBuilder, rect: { x: number; y: number; w: number; h: number }, baseY: number, style: string, roof: THREE.Color, gable: THREE.Color) {
  const swap = rect.h > rect.w // build with the ridge along x, then swap axes
  const x0 = swap ? rect.y : rect.x
  const z0 = swap ? rect.x : rect.y
  const w = swap ? rect.h : rect.w
  const d = swap ? rect.w : rect.h
  const x1 = x0 + w
  const z1 = z0 + d
  const zc = (z0 + z1) / 2
  const o = OVERHANG
  const ye = baseY - o * PITCH
  const yr = baseY + d * 0.5 * PITCH
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const tris: Tri[] = []
  const quad = (a: V, b: V, c: V, e: V, col: THREE.Color) => tris.push([a, b, c, col], [a, c, e, col])

  if (style === 'flat') {
    tris.push(...boxTris(v(x0 - o / 2, baseY, z0 - o / 2), v(x1 + o / 2, baseY + 0.3, z1 + o / 2), roof))
  } else {
    const e00 = v(x0 - o, ye, z0 - o)
    const e10 = v(x1 + o, ye, z0 - o)
    const e11 = v(x1 + o, ye, z1 + o)
    const e01 = v(x0 - o, ye, z1 + o)
    if (style === 'hip') {
      const ra = v(x0 + d / 2, yr, zc)
      const rb = v(x1 - d / 2, yr, zc)
      quad(e00, e10, rb, ra, roof)
      quad(e11, e01, ra, rb, roof)
      tris.push([e01, e00, ra, roof], [e10, e11, rb, roof])
    } else {
      const r0 = v(x0 - o, yr, zc)
      const r1 = v(x1 + o, yr, zc)
      quad(e00, e10, r1, r0, roof)
      quad(e11, e01, r0, r1, roof)
      for (const x of [x0, x1]) tris.push([v(x, baseY, z0), v(x, baseY, z1), v(x, yr, zc), gable])
    }
  }
  const center = v((x0 + x1) / 2, baseY, zc)
  const sw = (p: V) => (swap ? v(p.z, p.y, p.x) : p)
  for (const t of tris) mb.add(sw(t[0]), sw(t[1]), sw(t[2]), t[3], sw(center))
}

function boxTris(lo: V, hi: V, color: THREE.Color): Tri[] {
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x ? hi.x : lo.x, y ? hi.y : lo.y, z ? hi.z : lo.z)
  const faces = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  ]
  const out: Tri[] = []
  for (const f of faces) {
    const q = f.map(([x, y, z]) => p(x, y, z))
    out.push([q[0], q[1], q[2], color], [q[0], q[2], q[3], color])
  }
  return out
}
