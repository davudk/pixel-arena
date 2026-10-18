// Sculpts (raise, lower, smooth, flatten) and paints terrain with a round brush (port of
// TerrainTool). Hold the left button to apply continuously; one stroke is one undo step. Props
// standing on the ground (no parent) ride the surface, together with anything sitting on them.
// [ / ] brush size, Shift+[ / ] strength, Esc returns to selection.

import * as THREE from 'three'
import { MapDocument, Signal, terrainBrush, terrainEdit, Vec2i, Vec3, withDescendants } from '@pixel-arena/core'
import type { Editor, Pointer, Tool } from './editor'

export type TerrainMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint'

/** Brush settings shared by the tool and the options panel; persist across activations. */
export const terrainSettings = {
  mode: 'raise' as TerrainMode,
  radius: 4,
  strength: 0.5,
  material: 1,
  changed: new Signal<void>(),
}

const RAISE_SPEED = 6 // meters per second at full strength, brush center
const BLEND_SPEED = 8 // smooth / flatten blend per second at full strength
const GROUNDED_EPSILON = 0.05

export class TerrainTool implements Tool {
  readonly name = 'terrain'
  private stroking = false
  private flattenTarget = 0
  private ring: THREE.Line

  constructor(private editor: Editor) {
    const mat = new THREE.LineBasicMaterial({ color: '#ffd84d', depthTest: false, transparent: true })
    this.ring = new THREE.Line(new THREE.BufferGeometry(), mat)
    this.ring.renderOrder = 10
    this.ring.frustumCulled = false
  }

  activate() {
    this.editor.scene.add(this.ring)
    this.pointerMove(this.editor.cursor)
  }

  deactivate() {
    if (this.stroking) this.endStroke()
    this.editor.scene.remove(this.ring)
  }

  pointerDown(p: Pointer) {
    const hit = this.editor.groundAt(p)
    if (!hit) return
    this.stroking = true
    this.flattenTarget = hit.y
    const m = terrainSettings.mode
    this.editor.session.begin(`${m[0].toUpperCase()}${m.slice(1)} terrain`)
    this.apply(hit, 1 / 60)
  }

  pointerMove(p: Pointer) {
    const hit = this.editor.groundAt(p)
    this.ring.visible = !!hit
    if (hit) this.drawRing(hit)
  }

  pointerUp() {
    if (this.stroking) this.endStroke()
  }

  update(dt: number) {
    if (!this.stroking) return
    const hit = this.editor.groundAt(this.editor.cursor)
    if (hit) {
      this.apply(hit, dt)
      this.drawRing(hit)
    }
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
      const up = e.key === ']' || e.key === '}'
      if (e.shiftKey) terrainSettings.strength = Math.min(1, Math.max(0.05, terrainSettings.strength + (up ? 0.1 : -0.1)))
      else terrainSettings.radius = Math.min(32, Math.max(1, terrainSettings.radius * (up ? 1.25 : 0.8)))
      terrainSettings.changed.emit()
      this.pointerMove(this.editor.cursor)
      return true
    }
    if (e.key === 'Escape') {
      this.editor.setTool(this.editor.defaultTool())
      return true
    }
    return false
  }

  private endStroke() {
    this.stroking = false
    this.editor.session.commit()
  }

  private apply(center: THREE.Vector3, dt: number) {
    const s = this.editor.session
    const doc = s.doc
    const c = new Vec3(center.x, center.y, center.z)
    const { mode, radius, strength, material } = terrainSettings
    if (mode === 'paint') {
      for (const op of terrainBrush.paintOps(doc, c, radius, material)) s.apply(op)
      return
    }
    const amount = strength * (mode === 'raise' || mode === 'lower' ? RAISE_SPEED : BLEND_SPEED) * dt
    const grounded = this.groundedObjects(c, radius)
    for (const op of terrainBrush.sculptOps(doc, mode, c, radius, amount, this.flattenTarget)) s.apply(op)
    for (const id of grounded) {
      const p = doc.getProp(id, 'position') as Vec3
      const dy = terrainEdit.heightAtWorld(doc, p.x, p.z) - p.y
      if (Math.abs(dy) < 0.0001) continue
      for (const moved of withDescendants(doc, [id])) s.setProp(moved, 'position', (doc.getProp(moved, 'position') as Vec3).add(new Vec3(0, dy, 0)))
    }
  }

  /** Unparented props within the brush that currently stand on the terrain surface. */
  private groundedObjects(center: Vec3, radius: number): string[] {
    const doc = this.editor.session.doc
    const reach = radius + 1
    const lo = MapDocument.chunkOf(center.sub(new Vec3(reach, 0, reach)))
    const hi = MapDocument.chunkOf(center.add(new Vec3(reach, 0, reach)))
    const out: string[] = []
    for (let cz = lo.y; cz <= hi.y; cz++)
      for (let cx = lo.x; cx <= hi.x; cx++)
        for (const id of doc.objectsInChunk(new Vec2i(cx, cz))) {
          const obj = doc.getObject(id)!
          if (obj.type !== 'prop' || obj.props.has('parent')) continue
          const p = obj.props.get('position') as Vec3
          if (Math.hypot(p.x - center.x, p.z - center.z) > reach) continue
          if (Math.abs(p.y - terrainEdit.heightAtWorld(doc, p.x, p.z)) < GROUNDED_EPSILON) out.push(id)
        }
    return out
  }

  private drawRing(center: THREE.Vector3) {
    const doc = this.editor.session.doc
    const r = terrainSettings.radius
    const pts: number[] = []
    for (let i = 0; i <= 48; i++) {
      const a = (Math.PI * 2 * i) / 48
      const x = center.x + Math.cos(a) * r
      const z = center.z + Math.sin(a) * r
      pts.push(x, terrainEdit.heightAtWorld(doc, x, z) + 0.05, z)
    }
    this.ring.geometry.dispose()
    this.ring.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  }
}
