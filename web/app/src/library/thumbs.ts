// Offscreen prop thumbnails: one render per animation frame into a small target, read back to
// a data URL and cached in memory (a real build would cache to disk / IndexedDB).

import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { loadModel } from './models'
import type { PremadeDef, PropDef } from './library'

/** Something to draw: its id, and how to make the object (with its bounds). */
interface Job { id: string; make: () => Promise<{ obj: THREE.Object3D; box: THREE.Box3 }> }

const SIZE = 96

export class Thumbnails {
  private target = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace })
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera()
  private queue: Job[] = []
  /** Builds a premade building's scene object (world/premade-visual.ts; set by the app). */
  buildingObject: ((def: PremadeDef) => Promise<THREE.Object3D>) | null = null
  private queued = new Set<string>()
  private urls = new Map<string, string>()
  private busy = false
  private canvas = document.createElement('canvas')
  onReady: (id: string, url: string) => void = () => {}

  constructor(private renderer: THREE.WebGLRenderer) {
    this.canvas.width = this.canvas.height = SIZE
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#667788', 2.2))
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(2, 4, 3)
    this.scene.add(sun)
  }

  get(prop: PropDef): string | null {
    const url = this.urls.get(prop.id)
    if (url) return url
    if (!this.queued.has(prop.id)) {
      this.queued.add(prop.id)
      this.queue.push({
        id: prop.id,
        make: async () => {
          const model = await loadModel(prop)
          return { obj: SkeletonUtils.clone(model.scene), box: model.box } // keeps skinned meshes bound
        },
      })
    }
    return null
  }

  /** A premade building's thumbnail (null until drawn). */
  getBuilding(def: PremadeDef): string | null {
    const url = this.urls.get(def.id)
    if (url) return url
    if (!this.queued.has(def.id) && this.buildingObject) {
      this.queued.add(def.id)
      const build = this.buildingObject
      this.queue.push({
        id: def.id,
        make: async () => {
          const obj = await build(def)
          return { obj, box: new THREE.Box3().setFromObject(obj) }
        },
      })
    }
    return null
  }

  /** Puts these props at the front of the queue (the ones currently listed). */
  prioritize(props: { id: string }[]) {
    const ids = new Set(props.map((p) => p.id))
    this.queue.sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)))
  }

  async tick() {
    if (this.busy || this.queue.length === 0) return
    this.busy = true
    const job = this.queue.shift()!
    try {
      const { obj, box } = await job.make()
      this.scene.add(obj)
      const center = box.getCenter(new THREE.Vector3())
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01)
      const dir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(-0.52, 0.61, 0, 'YXZ'))
      const cam = this.camera
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius
      cam.near = 0.01; cam.far = radius * 8
      cam.position.copy(center).addScaledVector(dir, radius * 4)
      cam.lookAt(center)
      cam.updateProjectionMatrix()
      const r = this.renderer
      r.setRenderTarget(this.target)
      r.setClearColor(0x000000, 0)
      r.clear()
      r.render(this.scene, cam)
      const pixels = new Uint8Array(SIZE * SIZE * 4)
      r.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, pixels)
      r.setRenderTarget(null)
      r.setClearColor(0x000000, 1)
      this.scene.remove(obj)
      const ctx = this.canvas.getContext('2d')!
      const img = ctx.createImageData(SIZE, SIZE)
      for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
      ctx.putImageData(img, 0, 0)
      const url = this.canvas.toDataURL()
      this.urls.set(job.id, url)
      this.onReady(job.id, url)
    } finally {
      this.queued.delete(job.id)
      this.busy = false
    }
  }
}
