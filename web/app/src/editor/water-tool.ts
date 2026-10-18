// Draws a water body (port of WaterTool): click to add corners (snapped to 0.5 m; hold Cmd/Ctrl
// for free), click the first corner or press Enter to finish, Backspace removes the last corner,
// Esc cancels. The surface sits at the terrain height of the first corner; raise or lower it
// afterwards with PageUp / PageDown in the select tool. The polygon is stored relative to the
// object's position, so moving / rotating water works like any other object.

import * as THREE from 'three'
import { PackedVec2Array, terrainEdit, Vec2, Vec3 } from '@pixel-arena/core'
import type { Editor, Pointer, Tool } from './editor'

const CLOSE_DISTANCE = 12 // CSS px

export class WaterTool implements Tool {
  readonly name = 'water'
  private points: THREE.Vector3[] = []
  private hover: THREE.Vector3 | null = null
  private line: THREE.Line

  constructor(private editor: Editor) {
    this.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#66ccff', depthTest: false, transparent: true }))
    this.line.renderOrder = 10
    this.line.frustumCulled = false
  }

  activate() {
    this.editor.scene.add(this.line)
    this.pointerMove(this.editor.cursor)
  }

  deactivate() {
    this.editor.scene.remove(this.line)
  }

  pointerMove(p: Pointer) {
    this.hover = this.snapped(p)
    this.redraw()
  }

  pointerDown(p: Pointer) {
    if (this.points.length >= 3) {
      const first = this.editor.pixel.toScreen(this.points[0], this.editor.rig)
      if (first && Math.hypot(p.x - first.x, p.y - first.y) < CLOSE_DISTANCE) {
        this.finish()
        return
      }
    }
    const pt = this.snapped(p)
    if (pt) {
      this.points.push(pt)
      this.redraw()
    }
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') this.finish()
    else if (e.key === 'Backspace' || e.key === 'Delete') {
      this.points.pop()
      this.redraw()
    } else if (e.key === 'Escape') {
      if (this.points.length === 0) this.editor.setTool(this.editor.defaultTool())
      else {
        this.points = []
        this.redraw()
      }
    } else return false
    return true
  }

  /** Creates the water object (and selects it) if the outline is a valid simple polygon. */
  finish(): string | null {
    if (this.points.length < 3) return null
    const cx = this.points.reduce((a, p) => a + p.x, 0) / this.points.length
    const cz = this.points.reduce((a, p) => a + p.z, 0) / this.points.length
    const polygon = this.points.map((p) => new Vec2(p.x - cx, p.z - cz))
    if (selfIntersects(polygon)) return null // keep editing
    const level = this.points[0].y
    this.points = []
    const s = this.editor.session
    let id = ''
    s.edit('Add water', () => {
      id = s.createObject('water', { position: new Vec3(cx, level, cz), rotation: 0, polygon: new PackedVec2Array(polygon) })
    })
    this.editor.setTool(this.editor.defaultTool())
    this.editor.selection.set([id])
    return id
  }

  private snapped(p: Pointer): THREE.Vector3 | null {
    const hit = this.editor.groundAt(p)
    if (!hit) return null
    const x = p.cmd ? hit.x : Math.round(hit.x * 2) / 2
    const z = p.cmd ? hit.z : Math.round(hit.z * 2) / 2
    return new THREE.Vector3(x, terrainEdit.heightAtWorld(this.editor.session.doc, x, z), z)
  }

  private redraw() {
    const pts = this.hover ? [...this.points, this.hover] : [...this.points]
    const pos: number[] = []
    if (pts.length >= 2) {
      const y = pts[0].y + 0.05
      for (const p of [...pts, pts[0]]) pos.push(p.x, y, p.z)
    }
    this.line.geometry.dispose()
    this.line.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  }
}

/** True if any two non-adjacent edges of the closed polygon cross. */
export function selfIntersects(poly: Vec2[]): boolean {
  const n = poly.length
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const intersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) =>
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (intersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true
    }
  return false
}
