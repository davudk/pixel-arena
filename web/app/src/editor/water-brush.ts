// Water by round brush: the brush shape of two registry tools, "water" (paints params.water.liquid
// with a solid brush: no strength, water is there or it isn't; dig / depth / shore as for
// drawing) and "waterErase" (removes water; what's erased becomes land). Drag to paint; on
// release the stroke (the area the brush swept) goes through the water rules in water-shapes.ts
// (merge with the same liquid, replace others, dig a basin on dry ground) as one edit. [ / ]
// change the size; Esc puts the tool down.

import * as THREE from 'three'
import { terrainEdit } from '@pixel-arena/core'
import { liquid } from '../world/liquids'
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { overlayLine, setLinePoints, toOverlay } from '../render/overlay'
import type { Editor, Pointer, Tool } from './editor'
import { drawLabel } from './labels'
import { params, setParams } from './tool-params'
import { addWater, eraseWater, noteWaterAdded, strokeShape } from './water-shapes'

export class WaterBrushTool implements Tool {
  private path: [number, number][] = []
  private painting = false
  /** Brush outline and the stroke so far (unfiltered overlay, render/overlay.ts). */
  private ring
  private preview = new THREE.Group()

  constructor(private editor: Editor, readonly name: 'water' | 'waterErase' = 'water') {
    this.ring = overlayLine([], { color: this.color(), width: 2, occluded: false })
    this.ring.renderOrder = 10
    this.ring.userData.overlay = true // not in exports
    this.preview.renderOrder = 9
    this.preview.userData.overlay = true
  }

  private get radius(): number {
    return params[this.name].radius
  }

  private color(): string {
    return this.name === 'waterErase' ? '#ff8a7a' : liquid(params.water.liquid).shallow
  }

  activate() {
    this.editor.scene.add(this.ring, this.preview)
    this.pointerMove(this.editor.cursor)
  }

  deactivate() {
    this.painting = false
    this.path = []
    this.clearPreview()
    this.editor.scene.remove(this.ring, this.preview)
  }

  pointerDown(p: Pointer) {
    const hit = this.editor.groundAt(p)
    if (!hit) return
    this.painting = true
    this.path = [[hit.x, hit.z]]
    this.stamp(hit.x, hit.z)
  }

  pointerMove(p: Pointer) {
    const hit = this.editor.groundAt(p)
    this.ring.visible = !!hit
    if (!hit) return
    this.drawRing(hit)
    if (!this.painting) return
    const last = this.path.at(-1)!
    // A point every quarter radius keeps the swept band smooth.
    if (Math.hypot(hit.x - last[0], hit.z - last[1]) >= this.radius * 0.25) {
      this.path.push([hit.x, hit.z])
      this.stamp(hit.x, hit.z)
    }
  }

  pointerUp() {
    if (!this.painting) return
    this.painting = false
    const shape = strokeShape(this.path, this.radius)
    const start = this.path[0]
    this.path = []
    this.clearPreview()
    const s = this.editor.session
    if (this.name === 'waterErase') {
      s.edit('Erase water', () => eraseWater(s, shape))
      return
    }
    const b = params.water
    let ids: string[] = []
    s.edit(drawLabel(b.liquid), () => {
      ids = addWater(s, shape, { liquid: b.liquid, dig: b.dig, depth: b.depth, shore: b.shore, start })
    })
    noteWaterAdded(ids)
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === '[' || e.key === ']') {
      const radius = Math.min(16, Math.max(0.5, Math.round(this.radius * (e.key === ']' ? 1.25 : 0.8) * 2) / 2))
      setParams(this.name, { radius })
      this.pointerMove(this.editor.cursor)
      return true
    }
    if (e.key === 'Escape') {
      this.editor.setTool(this.editor.defaultTool())
      return true
    }
    return false
  }

  /** The stroke so far, as see-through discs (cheap to draw while painting). */
  private stamp(x: number, z: number) {
    const y = terrainEdit.heightAtWorld(this.editor.session.doc, x, z) + 0.06
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.color(), transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }),
    )
    disc.position.set(x, y, z)
    disc.renderOrder = 9
    this.preview.add(toOverlay(disc))
  }

  private clearPreview() {
    for (const c of [...this.preview.children]) {
      this.preview.remove(c)
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }

  private drawRing(center: THREE.Vector3) {
    const pts: THREE.Vector3[] = []
    const doc = this.editor.session.doc
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const x = center.x + Math.cos(a) * this.radius
      const z = center.z + Math.sin(a) * this.radius
      pts.push(new THREE.Vector3(x, terrainEdit.heightAtWorld(doc, x, z) + 0.08, z))
    }
    setLinePoints(this.ring, pts, false)
    ;(this.ring.material as LineMaterial).color.set(this.color())
  }
}
