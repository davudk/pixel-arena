// Drawing a closed outline on the ground (shared by water and terrain paint). Click to add
// corners (snapped to 0.5 m unless the tool's snap is off or Cmd/Ctrl is held; Shift keeps the
// new side at a multiple of 45°); click the first corner again or press Enter to finish;
// Backspace removes the last corner; Esc drops the outline, or puts the tool down when there is
// none.
//
// While drawing, indicators replace any on-screen text: a cursor dot in the tool's color with a
// "+", corner dots joined by solid lines, a dashed line from the last corner to the cursor (no
// closing line), the first corner as a ring that grows and fills when the cursor snaps to it
// (the cursor becomes a check), and a faint fill of the area once there are three corners.

import * as THREE from 'three'
import { terrainEdit, Vec2 } from '@pixel-arena/core'
import { overlayLine, toOverlay } from '../render/overlay'
import type { Editor, Pointer, Tool } from './editor'

const CLOSE_DISTANCE = 12 // CSS px from the first corner that closes the outline
const SNAP = 0.5 // m

/** Draws a closed outline on the ground; subclasses say what it's for (its color, whether it
 *  snaps) and what happens when it closes (`commit`). */
export abstract class PolygonTool implements Tool {
  private points: THREE.Vector3[] = []
  private hover: THREE.Vector3 | null = null
  /** The cursor is on the first corner (with 3+ corners): a click closes the outline. */
  private closing = false
  private overlay = new THREE.Group()
  private drawnZoom = 0

  abstract readonly name: string

  constructor(protected editor: Editor) {
    this.overlay.renderOrder = 10
    this.overlay.userData.overlay = true // not in exports
  }

  /** Indicator color (CSS). */
  protected abstract color(): string
  /** Corners snap to the half-meter grid (Cmd/Ctrl turns it off while held). */
  protected abstract snaps(): boolean
  /** Uses the closed outline (world x / z); the outline is cleared after. */
  protected abstract commit(ring: [number, number][], start: [number, number]): void

  activate() {
    this.editor.scene.add(this.overlay)
    this.pointerMove(this.editor.cursor)
  }

  deactivate() {
    this.clearOverlay()
    this.editor.scene.remove(this.overlay)
  }

  pointerMove(p: Pointer) {
    this.closing = false
    this.hover = this.snapped(p)
    if (this.points.length >= 3) {
      const first = this.editor.pixel.toScreen(this.points[0], this.editor.rig)
      if (first && Math.hypot(p.x - first.x, p.y - first.y) < CLOSE_DISTANCE) {
        this.closing = true
        this.hover = this.points[0].clone()
      }
    }
    this.redraw()
  }

  pointerDown(p: Pointer) {
    this.pointerMove(p)
    if (this.closing) {
      this.finish()
      return
    }
    if (this.hover) {
      this.points.push(this.hover.clone())
      this.redraw()
    }
  }

  /** Indicators keep a constant on-screen size, so redraw when zooming. */
  update() {
    if (this.editor.rig.zoom !== this.drawnZoom) this.redraw()
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

  /** Commits the outline if it is a valid simple polygon; otherwise keeps editing. */
  finish(): boolean {
    if (this.points.length < 3) return false
    if (selfIntersects(this.points.map((p) => new Vec2(p.x, p.z)))) return false
    const ring: [number, number][] = this.points.map((p) => [p.x, p.z])
    const start: [number, number] = [this.points[0].x, this.points[0].z]
    this.points = []
    this.redraw()
    this.commit(ring, start)
    return true
  }

  private snapped(p: Pointer): THREE.Vector3 | null {
    const hit = this.editor.groundAt(p)
    if (!hit) return null
    const free = p.cmd || !this.snaps()
    let x = free ? hit.x : Math.round(hit.x / SNAP) * SNAP
    let z = free ? hit.z : Math.round(hit.z / SNAP) * SNAP
    // Shift: the new side runs at a multiple of 45° from the last corner. With snapping on, its
    // length steps so the corner stays on the grid (half meters along an axis, half-meter
    // diagonals along a diagonal).
    const last = this.points.at(-1)
    if (p.shift && last) {
      const angle = Math.round(Math.atan2(hit.z - last.z, hit.x - last.x) / (Math.PI / 4)) * (Math.PI / 4)
      const dx = Math.cos(angle)
      const dz = Math.sin(angle)
      let len = (hit.x - last.x) * dx + (hit.z - last.z) * dz
      if (!free) {
        const step = Math.abs(dx) > 1e-6 && Math.abs(dz) > 1e-6 ? SNAP * Math.SQRT2 : SNAP
        len = Math.round(len / step) * step
      }
      x = last.x + Math.round(dx * len * 1e6) / 1e6
      z = last.z + Math.round(dz * len * 1e6) / 1e6
    }
    return new THREE.Vector3(x, terrainEdit.heightAtWorld(this.editor.session.doc, x, z), z)
  }

  // --- Indicators ------------------------------------------------------------------------

  private clearOverlay() {
    for (const child of [...this.overlay.children]) {
      this.overlay.remove(child)
      const m = child as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material)?.dispose()
    }
  }

  private redraw() {
    this.clearOverlay()
    this.drawnZoom = this.editor.rig.zoom
    // World meters per CSS pixel, so markers keep their on-screen size (big enough to survive
    // the pixel filter's low resolution).
    const px = this.editor.rig.zoom / Math.max(1, this.editor.pixel.canvas.clientHeight)
    const color = new THREE.Color(this.color())
    const lift = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y + 0.05, v.z)
    const pts = this.points.map(lift)
    const hover = this.hover && lift(this.hover)
    // Unfiltered, at full resolution (render/overlay.ts).
    const add = (o: THREE.Object3D) => {
      o.renderOrder = 10
      this.overlay.add(toOverlay(o))
    }
    const flat = (opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    const line = (vs: THREE.Vector3[]) => add(overlayLine(vs, { color, width: 2, occluded: false }))
    const disc = (at: THREE.Vector3, r: number, opacity = 1) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), flat(opacity))
      m.position.copy(at)
      add(m)
    }
    const ring = (at: THREE.Vector3, r: number) => {
      const vs = Array.from({ length: 33 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2
        return new THREE.Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r)
      })
      line(vs)
    }

    // Area preview once it's a polygon (with the cursor as the next corner).
    const outline = hover && !this.closing ? [...pts, hover] : pts
    if (outline.length >= 3) {
      const shape = new THREE.Shape(outline.map((v) => new THREE.Vector2(v.x, v.z)))
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), flat(0.28))
      fill.position.y = Math.min(...outline.map((v) => v.y))
      add(fill)
    }
    // Placed corners joined by solid lines; no closing segment.
    if (pts.length >= 2) line(pts)
    for (const p of pts.slice(1)) disc(p, 5 * px)
    if (pts.length > 0) {
      ring(pts[0], (this.closing ? 20 : 12) * px)
      disc(pts[0], (this.closing ? 20 : 5) * px, this.closing ? 0.55 : 1)
    }
    // Dashed line from the last corner to the cursor.
    if (hover && pts.length > 0 && !this.closing) {
      add(overlayLine([pts.at(-1)!, hover], { color, width: 2, occluded: false, dashed: [9 * px, 6 * px] }))
    }
    // Cursor: a dot with a "+" (next click adds a corner) or a check (next click closes).
    if (hover) {
      const r = 11 * px
      const white = (vs: THREE.Vector3[]) => add(overlayLine(vs, { color: '#ffffff', width: 2, occluded: false }))
      // The "+" and the check face the camera, so the view's tilt doesn't squash them.
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.editor.rig.camera.quaternion)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.editor.rig.camera.quaternion)
      const v = (dx: number, dy: number) => hover.clone().addScaledVector(right, dx * r).addScaledVector(up, -dy * r)
      if (this.closing) white([v(-0.9, 0), v(-0.2, 0.7), v(1.05, -0.8)])
      else {
        disc(hover, r, 0.85)
        white([v(-0.55, 0), v(0.55, 0)])
        white([v(0, -0.55), v(0, 0.55)])
      }
    }
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
