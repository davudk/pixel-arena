// Draws a body of water (or another liquid: params.water.liquid) as a polygon (port of
// WaterTool): click to add corners (snapped to 0.5 m unless params.water.snap is off or Cmd/Ctrl
// is held); click the first corner again or press Enter to finish; Backspace removes the last
// corner; Esc drops the outline, or puts the tool down when there is none.
//
// With params.water.dig (default) the surface sits at the lowest ground along the outline, so it
// never spills, and the ground inside is lowered into a basin `depth` deep that eases in over
// `shore` meters from the edge; ground already lower (a hollow) is left alone. The basin and the
// water are one edit (one undo step). Without dig the surface sits at the first corner's height.
//
// While drawing, indicators replace any on-screen text: a liquid-colored cursor dot with a "+",
// corner dots joined by solid lines, a dashed line from the last corner to the cursor (no closing
// line), the first corner as a ring that grows and fills when the cursor snaps to it (the cursor
// becomes a check), and a faint fill of the area once there are three corners.
//
// The polygon is stored relative to the object's position, so moving / rotating water works like
// any other object; PageUp / PageDown in the select tool raise or lower the surface.

import * as THREE from 'three'
import { PackedVec2Array, Rect2i, terrainEdit, Vec2, Vec3, type MapDocument } from '@pixel-arena/core'
import { liquid } from '../world/liquids'
import type { Editor, Pointer, Tool } from './editor'
import { drawLabel } from './labels'
import { params } from './tool-params'

const CLOSE_DISTANCE = 12 // CSS px from the first corner that closes the outline
const SNAP = 0.5 // m

type TerrainOp = ReturnType<typeof terrainEdit.heightOps>[number]

export class WaterTool implements Tool {
  readonly name = 'water'
  private points: THREE.Vector3[] = []
  private hover: THREE.Vector3 | null = null
  /** The cursor is on the first corner (with 3+ corners): a click closes the outline. */
  private closing = false
  private overlay = new THREE.Group()
  private drawnZoom = 0

  constructor(private editor: Editor) {
    this.overlay.renderOrder = 10
  }

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

  /** Creates the water object (digging its basin) and selects it, if the outline is a valid
   *  simple polygon. Returns its id, or null (and keeps editing). */
  finish(): string | null {
    if (this.points.length < 3) return null
    const world = this.points.map((p) => new Vec2(p.x, p.z))
    const cx = world.reduce((a, p) => a + p.x, 0) / world.length
    const cz = world.reduce((a, p) => a + p.y, 0) / world.length
    const polygon = world.map((p) => new Vec2(p.x - cx, p.y - cz))
    if (selfIntersects(polygon)) return null
    const w = params.water
    const s = this.editor.session
    const basin = w.dig ? planBasin(s.doc, world, w.depth, w.shore) : { level: this.points[0].y, ops: [] }
    this.points = []
    let id = ''
    s.edit(drawLabel(w.liquid), () => {
      for (const op of basin.ops) s.apply(op)
      id = s.createObject('water', { position: new Vec3(cx, basin.level, cz), rotation: 0, polygon: new PackedVec2Array(polygon), liquid: w.liquid })
    })
    this.editor.setTool(this.editor.defaultTool())
    this.editor.selection.set([id])
    return id
  }

  private snapped(p: Pointer): THREE.Vector3 | null {
    const hit = this.editor.groundAt(p)
    if (!hit) return null
    const free = p.cmd || !params.water.snap
    const x = free ? hit.x : Math.round(hit.x / SNAP) * SNAP
    const z = free ? hit.z : Math.round(hit.z / SNAP) * SNAP
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
    const l = liquid(params.water.liquid)
    const color = new THREE.Color(l.shallow)
    const lift = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y + 0.05, v.z)
    const pts = this.points.map(lift)
    const hover = this.hover && lift(this.hover)
    const add = (o: THREE.Object3D) => {
      o.renderOrder = 10
      o.frustumCulled = false
      this.overlay.add(o)
    }
    const flat = (opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    const lineMat = () => new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false })
    const line = (vs: THREE.Vector3[]) => add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vs), lineMat()))
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
      const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts.at(-1)!, hover]),
        new THREE.LineDashedMaterial({ color, dashSize: 9 * px, gapSize: 6 * px, transparent: true, depthTest: false }))
      dashed.computeLineDistances()
      add(dashed)
    }
    // Cursor: a dot with a "+" (next click adds a corner) or a check (next click closes).
    if (hover) {
      const r = 11 * px
      const white = (vs: THREE.Vector3[]) =>
        add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vs), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false })))
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

/** Where the surface of water drawn along `poly` (world x, z) goes, and the terrain ops that dig
 *  its basin: surface at the lowest ground along the outline; inside, ground lowered toward
 *  `surface - depth`, easing in over `shore` meters from the edge. Ground is never raised, and an
 *  area that is already a hollow below the surface is left as it is. */
export function planBasin(doc: MapDocument, poly: Vec2[], depth: number, shore: number): { level: number; ops: TerrainOp[] } {
  const n = poly.length
  // Lowest ground along the outline, sampled every half meter.
  let level = Infinity
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      level = Math.min(level, terrainEdit.heightAtWorld(doc, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))
    }
  }
  const x0 = Math.floor(Math.min(...poly.map((p) => p.x)))
  const z0 = Math.floor(Math.min(...poly.map((p) => p.y)))
  const x1 = Math.ceil(Math.max(...poly.map((p) => p.x)))
  const z1 = Math.ceil(Math.max(...poly.map((p) => p.y)))
  const rect = new Rect2i(x0, z0, x1 - x0 + 1, z1 - z0 + 1)
  const inside = (x: number, z: number) => insidePolygon(poly, x, z)

  // Already a hollow (nothing inside reaches the surface): just fill it. Samples on or right by
  // the outline sit at rim height by definition, so they don't count.
  let interiorMax = -Infinity
  for (let sz = rect.y; sz < rect.endY; sz++)
    for (let sx = rect.x; sx < rect.endX; sx++)
      if (inside(sx, sz) && edgeDistance(poly, sx, sz) >= 0.5) interiorMax = Math.max(interiorMax, terrainEdit.heightAt(doc, sx, sz))
  if (interiorMax === -Infinity || interiorMax < level - 0.1) return { level, ops: [] }

  const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2
  const ops = terrainEdit.heightOps(doc, rect, (sx, sz, old) => {
    if (!inside(sx, sz)) return old
    const target = level - depth * ease(edgeDistance(poly, sx, sz) / shore)
    return Math.min(old, Math.round(target * 1000) / 1000)
  })
  return { level, ops }
}

function insidePolygon(poly: Vec2[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Distance from (x, z) to the polygon's outline. */
function edgeDistance(poly: Vec2[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dz = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.y + dz * t)))
  }
  return best
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
