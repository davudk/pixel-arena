// Offscreen exports with the current filter (port of the planned Godot M7 export):
//   snapshot  - the current view, upscaled with nearest sampling (pixel-exact)
//   top-down  - the whole map from straight above at N pixels per meter, rendered in tiles and
//               stitched, so big maps aren't limited by the GPU's maximum texture size
//   angles    - top-down plus four isometric views, each framing the whole map
// Every render goes through its own PixelPass on the shared WebGLRenderer with an orthographic
// camera framed on whole texels, so exports look exactly like the screen.

import * as THREE from 'three'
import { BuildingLayout, PackedVec2Array, terrainChunk, Vec3, type MapDocument } from '@pixel-arena/core'
import type { Library } from '../library/library'
import type { DayCycle } from './day-cycle'
import type { Ground } from './ground'
import { MARGIN, PixelPass } from './pixel'
import type { FilterOptions } from './filters'
import { showGrid } from './terrain-shading'

/** Largest image we produce (each side). */
export const MAX_SIZE = 16384
const TILE = 1024 // output pixels per tile side (before rounding to whole texels)
const ISO_PITCH = -Math.atan(1 / Math.SQRT2)

export interface ExportImage {
  name: string
  width: number
  height: number
  canvas: HTMLCanvasElement
}

export interface Bounds {
  min: THREE.Vector3
  max: THREE.Vector3
}

export class Exporter {
  private pass: PixelPass
  private output = new THREE.WebGLRenderTarget(1, 1)
  private camera = new THREE.OrthographicCamera()

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private ground: Ground,
    private day: DayCycle,
    private library: Library,
  ) {
    this.pass = new PixelPass(renderer)
  }

  /** The current canvas, scaled up by an integer factor with nearest sampling. */
  snapshot(source: HTMLCanvasElement, scale: number): ExportImage {
    const canvas = document.createElement('canvas')
    canvas.width = source.width * scale
    canvas.height = source.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    return { name: 'snapshot', width: canvas.width, height: canvas.height, canvas }
  }

  /** World-space bounds of everything on the map (padded), or null for an empty map. */
  static bounds(doc: MapDocument, library: Library): Bounds | null {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    const add = (x: number, y: number, z: number) => {
      min.min(new THREE.Vector3(x, y, z))
      max.max(new THREE.Vector3(x, y, z))
    }
    for (const obj of doc.objects.values()) {
      const p = obj.props.get('position')
      if (obj.deleted || !(p instanceof Vec3)) continue
      if (obj.type === 'building') {
        const kit = library.kits.get(String(obj.props.get('kit')))
        const cs = kit?.cellSize ?? 3
        const h = kit?.wallHeight ?? 3
        const layout = BuildingLayout.fromObject(obj)
        const levels = layout.levelIndices()
        const yaw = Number(obj.props.get('rotation') ?? 0)
        for (const l of levels)
          for (const c of layout.cells(l).values())
            for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
              const lx = (c.x + dx) * cs
              const lz = (c.y + dz) * cs
              add(p.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), p.y + (levels.at(-1)! + 2) * h, p.z - lx * Math.sin(yaw) + lz * Math.cos(yaw))
            }
      } else if (obj.type === 'water') {
        for (const q of (obj.props.get('polygon') as PackedVec2Array).points) add(p.x + q.x, p.y, p.z + q.y)
      } else {
        const prop = library.props.get(String(obj.props.get('prop')))
        const r = prop ? Math.max(prop.footprint[0], prop.footprint[1]) / 2 : 1
        add(p.x - r, p.y, p.z - r)
        add(p.x + r, p.y + (prop?.height ?? 2), p.z + r)
      }
    }
    const N = terrainChunk.SIZE
    for (const c of doc.terrain.values()) {
      add(c.coord.x * N, c.minHeight, c.coord.y * N)
      add((c.coord.x + 1) * N, c.maxHeight, (c.coord.y + 1) * N)
    }
    if (!Number.isFinite(min.x)) return null
    min.x -= 4
    min.z -= 4
    max.x += 4
    max.z += 4
    min.y = Math.min(min.y, 0)
    max.y = Math.max(max.y, 1)
    return { min, max }
  }

  /** Whole map from straight above at `ppm` output pixels per meter; `px` output pixels per
   *  rendered texel (the filter's pixel size). Rendered in tiles and stitched. */
  topDown(doc: MapDocument, filter: FilterOptions, ppm: number, px: number, grid: boolean): ExportImage | null {
    const b = Exporter.bounds(doc, this.library)
    if (!b) return null
    const texel = px / ppm // meters per texel
    // Whole texels so tiles line up exactly.
    const texW = Math.ceil((b.max.x - b.min.x) / texel)
    const texH = Math.ceil((b.max.z - b.min.z) / texel)
    const width = Math.min(texW * px, MAX_SIZE - (MAX_SIZE % px))
    const height = Math.min(texH * px, MAX_SIZE - (MAX_SIZE % px))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const tile = Math.max(px, TILE - (TILE % px))
    const basis = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ')) // looking down, north up
    this.withExportState(grid, () => {
      for (let ty = 0; ty < height; ty += tile)
        for (let tx = 0; tx < width; tx += tile) {
          const w = Math.min(tile, width - tx)
          const h = Math.min(tile, height - ty)
          // Tile rect in world meters (x right, z down = image down).
          const cx = b.min.x + ((tx + w / 2) / px) * texel
          const cz = b.min.z + ((ty + h / 2) / px) * texel
          const center = new THREE.Vector3(cx, (b.min.y + b.max.y) / 2, cz)
          const img = this.render(center, basis, w, h, px, texel, filter, Math.max(w, h) / ppm)
          ctx.putImageData(img, tx, ty)
        }
    })
    return { name: 'top-down', width, height, canvas }
  }

  /** Top-down plus four isometric views of the whole map, each `size` pixels on its long side. */
  angles(doc: MapDocument, filter: FilterOptions, size: number, px: number, grid: boolean): ExportImage[] {
    const b = Exporter.bounds(doc, this.library)
    if (!b) return []
    const views: [string, number, number][] = [
      ['top', -Math.PI / 2 + 0.0001, 0],
      ['iso-ne', ISO_PITCH, Math.PI / 4],
      ['iso-nw', ISO_PITCH, -Math.PI / 4],
      ['iso-sw', ISO_PITCH, (-3 * Math.PI) / 4],
      ['iso-se', ISO_PITCH, (3 * Math.PI) / 4],
    ]
    const out: ExportImage[] = []
    this.withExportState(grid, () => {
      for (const [name, pitch, yaw] of views) {
        const basis = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
        // Frame the bounds' corners in camera space.
        const inv = basis.clone().transpose()
        const lo = new THREE.Vector2(Infinity, Infinity)
        const hi = new THREE.Vector2(-Infinity, -Infinity)
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const v = new THREE.Vector3(x, y, z).applyMatrix4(inv)
          lo.min(new THREE.Vector2(v.x, v.y))
          hi.max(new THREE.Vector2(v.x, v.y))
        }
        const spanW = hi.x - lo.x
        const spanH = hi.y - lo.y
        const scale = Math.min(size, 4096) / Math.max(spanW, spanH) // output px per meter
        const w = Math.max(px, Math.round((spanW * scale) / px) * px)
        const h = Math.max(px, Math.round((spanH * scale) / px) * px)
        const texel = px / scale
        const centerCam = new THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0).applyMatrix4(basis)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.putImageData(this.render(centerCam, basis, w, h, px, texel, filter, Math.max(spanW, spanH)), 0, 0)
        out.push({ name, width: w, height: h, canvas })
      }
    })
    return out
  }

  /** One orthographic render: `w` x `h` output pixels centred on `center` (world), camera
   *  rotation `basis`, `texel` meters per rendered texel, `px` output pixels per texel. */
  private render(center: THREE.Vector3, basis: THREE.Matrix4, w: number, h: number, px: number, texel: number, filter: FilterOptions, extent: number): ImageData {
    const low = new THREE.Vector2(w / px + MARGIN * 2, h / px + MARGIN * 2)
    const cam = this.camera
    const halfW = (low.x * texel) / 2
    const halfH = (low.y * texel) / 2
    cam.left = -halfW
    cam.right = halfW
    cam.top = halfH
    cam.bottom = -halfH
    const back = new THREE.Vector3(0, 0, 1).applyMatrix4(basis)
    const dist = extent + 200
    cam.near = 0.5
    cam.far = dist * 2 + 200
    cam.position.copy(center).addScaledVector(back, dist)
    cam.quaternion.setFromRotationMatrix(basis)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    this.ground.follow(center)
    this.day.follow(center, Math.max(halfW, halfH) * 1.2)
    if (this.output.width !== w || this.output.height !== h) this.output.setSize(w, h)
    this.pass.applyFilter(filter)
    // Editor overlays (selection glow and marks, axes; userData.overlay) stay out of exports.
    const hidden: THREE.Object3D[] = []
    this.scene.traverse((o) => {
      if (o.userData.overlay && o.visible) hidden.push(o)
    })
    hidden.forEach((o) => (o.visible = false))
    this.pass.render(this.scene, cam, low, new THREE.Vector2(w, h), px, new THREE.Vector2(0, 0), this.output)
    hidden.forEach((o) => (o.visible = true))
    const pixels = new Uint8ClampedArray(w * h * 4)
    this.renderer.readRenderTargetPixels(this.output, 0, 0, w, h, pixels)
    // WebGL rows are bottom-up; images are top-down.
    const flipped = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) flipped.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
    return new ImageData(flipped, w, h)
  }

  private withExportState(grid: boolean, fn: () => void) {
    const prevGrid = showGrid.value
    showGrid.value = grid
    try {
      fn()
    } finally {
      showGrid.value = prevGrid
    }
  }
}

/** Downloads one image as PNG, or several as a zip of PNGs. */
export async function download(images: ExportImage[], baseName: string) {
  const blobs = await Promise.all(images.map((i) => new Promise<Blob>((res) => i.canvas.toBlob((b) => res(b!), 'image/png'))))
  if (images.length === 1) return save(blobs[0], `${baseName}-${images[0].name}.png`)
  const { zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < images.length; i++) files[`${baseName}-${images[i].name}.png`] = new Uint8Array(await blobs[i].arrayBuffer())
  save(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${baseName}-views.zip`)
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
