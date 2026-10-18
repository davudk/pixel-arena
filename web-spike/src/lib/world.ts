// Scene for the spike: grid ground, sun + sky light, instanced props and placement.

import * as THREE from 'three'
import { loadModel, type Model } from './models'
import { snap, type PropDef } from './library'

const CHUNK = 32
const GROUND_SIZE = 4096

/** Ground plane (implicit flat terrain) with 1 m grid, 32 m chunk lines and a 4 m checker,
 *  lit by the standard Lambert pipeline (shadows included). */
function makeGround(): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color: '#5a8c45' })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorld;
float gridLine(vec2 p, float s) {
  vec2 q = p / s;
  vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
  return 1.0 - clamp(min(d.x, d.y), 0.0, 1.0);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 c4 = floor(vWorld.xz / 4.0);
diffuseColor.rgb *= mix(1.0, 0.92, mod(c4.x + c4.y, 2.0));
float pxPerM = 1.0 / max(max(fwidth(vWorld.x), fwidth(vWorld.z)), 1e-5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), gridLine(vWorld.xz, 1.0) * 0.12 * smoothstep(3.0, 6.0, pxPerM));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), gridLine(vWorld.xz, ${CHUNK}.0) * 0.5);`)
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2), mat)
  ground.receiveShadow = true
  return ground
}

interface Group {
  model: Model
  meshes: THREE.InstancedMesh[]
  count: number
  capacity: number
}

export interface Placed {
  prop: string
  position: THREE.Vector3
  yaw: number
}

export class World {
  readonly scene = new THREE.Scene()
  readonly ground = makeGround()
  readonly sun = new THREE.DirectionalLight('#fff5e0', 3.2)
  readonly placed: Placed[] = []
  private groups = new Map<string, Group>()
  private raycaster = new THREE.Raycaster()

  constructor() {
    this.scene.background = new THREE.Color('#87b4dd')
    this.scene.add(this.ground)
    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#5a6b46', 1.6))
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun, this.sun.target)
    this.raycaster.firstHitOnly = true
  }

  /** Keeps the ground and the sun's shadow box centered on the view. */
  follow(focus: THREE.Vector3, zoom: number) {
    this.ground.position.set(Math.round(focus.x / CHUNK) * CHUNK, 0, Math.round(focus.z / CHUNK) * CHUNK)
    const dir = new THREE.Vector3(0.55, 0.75, 0.38).normalize()
    // Snap the shadow camera to its own texel grid to keep shadow edges from swimming.
    const extent = zoom * 1.1
    const texel = (extent * 2) / this.sun.shadow.mapSize.x
    const f = new THREE.Vector3(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel)
    this.sun.position.copy(f).addScaledVector(dir, 200)
    this.sun.target.position.copy(f)
    const cam = this.sun.shadow.camera
    cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent
    cam.near = 1; cam.far = 500
    cam.updateProjectionMatrix()
  }

  async add(prop: PropDef, position: THREE.Vector3, yaw: number) {
    const model = await loadModel(prop)
    let g = this.groups.get(prop.id)
    if (!g) {
      g = { model, meshes: [], count: 0, capacity: 0 }
      this.groups.set(prop.id, g)
      this.grow(g, 16)
    }
    if (g.count === g.capacity) this.grow(g, g.capacity * 2)
    const m = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Object3D().up, yaw), new THREE.Vector3(1, 1, 1))
    const tmp = new THREE.Matrix4()
    g.model.parts.forEach((part, i) => {
      g!.meshes[i].setMatrixAt(g!.count, tmp.multiplyMatrices(m, part.matrix))
      g!.meshes[i].count = g!.count + 1
      g!.meshes[i].instanceMatrix.needsUpdate = true
      g!.meshes[i].computeBoundingSphere()
    })
    g.count++
    this.placed.push({ prop: prop.id, position: position.clone(), yaw })
  }

  clear() {
    for (const g of this.groups.values()) for (const m of g.meshes) this.scene.remove(m)
    this.groups.clear()
    this.placed.length = 0
  }

  stats() {
    let draws = 0
    for (const g of this.groups.values()) draws += g.meshes.length
    return { props: this.placed.length, kinds: this.groups.size, instancedMeshes: draws }
  }

  /** Ground or prop surface under an NDC point. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): { point: THREE.Vector3; onProp: boolean } | null {
    this.raycaster.setFromCamera(ndc, camera)
    const props: THREE.Object3D[] = []
    for (const g of this.groups.values()) props.push(...g.meshes)
    const hit = this.raycaster.intersectObjects(props, false)[0]
    if (hit && hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.7)
      return { point: hit.point, onProp: true }
    const p = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return { point: p, onProp: false }
    return null
  }

  /** Snapped placement position for a prop at a picked point. */
  placementFor(prop: PropDef, hit: { point: THREE.Vector3; onProp: boolean }, yaw: number, free: boolean): THREE.Vector3 {
    const [x, z] = snap(prop, hit.point.x, hit.point.z, yaw, free || (hit.onProp && prop.mode === 'grid'))
    return new THREE.Vector3(x, hit.onProp ? hit.point.y : 0, z)
  }

  private grow(g: Group, capacity: number) {
    g.model.parts.forEach((part, i) => {
      const next = new THREE.InstancedMesh(part.geometry, part.material, capacity)
      next.castShadow = true
      next.receiveShadow = true
      next.count = g.count
      const old = g.meshes[i]
      if (old) {
        next.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, g.count * 16))
        this.scene.remove(old)
        old.dispose()
      }
      next.computeBoundingSphere()
      g.meshes[i] = next
      this.scene.add(next)
    })
    g.capacity = capacity
  }
}

/** See-through copy of a prop for placement previews. */
export async function makeGhost(prop: PropDef): Promise<THREE.Object3D> {
  const model = await loadModel(prop)
  const ghost = model.scene.clone(true)
  ghost.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    const mat = (mesh.material as THREE.Material).clone()
    mat.transparent = true
    mat.opacity = 0.55
    mat.depthWrite = false
    mesh.material = mat
  })
  const holder = new THREE.Group()
  ghost.position.set(0, 0, 0)
  holder.add(ghost)
  return holder
}
