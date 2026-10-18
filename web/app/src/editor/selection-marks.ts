// Selection marks on the ground, like units in a strategy game: a thin ring around the base of
// each selected prop (centered on and sized to its model's footprint, which needn't be around
// the prop's origin), the footprint outline of a building, and the
// shoreline of a body of water (with its islands). A selected group marks its members. Locked
// objects are marked in grey. Drawn on the overlay (render/overlay.ts): never filtered, a fixed
// width on screen, and still hidden where the object stands in front of its ring.

import * as THREE from 'three'
import { BuildingLayout, PackedVec2Array, Vec3, type MapObject, type MapSession } from '@pixel-arena/core'
import type { Editor } from './editor'
import { loadModel } from '../library/models'
import { overlayLine, toOverlay } from '../render/overlay'
import { GROUP, isLocked, members } from './grouping'

const ACCENT = '#f2c14e'
const LOCKED = '#8c93a3'
const LIFT = 0.04 // m above the base, so the ring isn't lost in the ground

export class SelectionMarks {
  readonly root = new THREE.Group()
  private offDoc = () => {}

  constructor(private editor: Editor) {
    this.root.renderOrder = 5
    this.root.userData.overlay = true // not in exports
    editor.scene.add(this.root)
    editor.selection.changed.connect(() => this.rebuild())
    const watch = (s: MapSession) => {
      this.offDoc()
      const offs = [
        s.doc.changed.connect((op) => {
          if ('id' in op && this.marked.has(String(op.id))) this.rebuild()
        }),
        s.doc.reset.connect(() => this.rebuild()),
      ]
      this.offDoc = () => offs.forEach((f) => f())
    }
    watch(editor.session)
    editor.sessionChanged.connect((s) => {
      watch(s)
      this.rebuild()
    })
  }

  /** Ids with a mark (selected objects and the members of selected groups). */
  private marked = new Set<string>()
  /** Models' bounds by prop id, once loaded (the ring waits for them, see markFor). */
  private boxes = new Map<string, THREE.Box3 | null>()

  rebuild() {
    for (const child of [...this.root.children]) {
      this.root.remove(child)
      child.traverse((o) => {
        ;(o as THREE.Line).geometry?.dispose()
        ;((o as THREE.Line).material as THREE.Material | undefined)?.dispose?.()
      })
    }
    const doc = this.editor.session.doc
    const ids = new Set<string>()
    for (const id of this.editor.selection.list()) {
      if (doc.getObject(id)?.type === GROUP) members(doc, id).forEach((m) => ids.add(m))
      else ids.add(id)
    }
    this.marked = new Set([...ids, ...this.editor.selection.list()])
    for (const id of ids) {
      const obj = doc.getObject(id)
      if (!obj || obj.deleted) continue
      const mark = this.markFor(obj, isLocked(doc, id) ? LOCKED : ACCENT)
      if (mark) this.root.add(toOverlay(mark))
    }
  }

  /** The mark in the object's own frame, placed like the object. */
  private markFor(obj: MapObject, color: string): THREE.Object3D | null {
    const line = (points: THREE.Vector3[], o: { closed?: boolean; segments?: boolean } = {}) => overlayLine(points, { color, width: 2, ...o })
    const pos = obj.props.get('position')
    if (!(pos instanceof Vec3)) return null
    const group = new THREE.Group()
    group.position.set(pos.x, pos.y + LIFT, pos.z)
    group.rotation.y = Number(obj.props.get('rotation') ?? 0)
    if (obj.type === 'prop') {
      const prop = this.editor.library.props.get(String(obj.props.get('prop')))
      const scale = Number(obj.props.get('scale') ?? 1)
      // Around the model's own footprint (its bounds in the prop's frame), else the manifest's
      // footprint at the origin until the model has loaded.
      let [cx, cz, w, d] = [0, 0, ...(prop?.footprint ?? [1, 1])]
      const box = prop ? this.boxes.get(prop.id) : null
      if (box) {
        const c = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        ;[cx, cz, w, d] = [c.x, c.z, size.x, size.z]
      } else if (prop && !this.boxes.has(prop.id)) {
        this.boxes.set(prop.id, null)
        loadModel(prop).then((m) => {
          this.boxes.set(prop.id, m.box.clone())
          this.rebuild()
        }).catch(() => {})
      }
      const r = Math.max(0.35, Math.hypot(w, d) * 0.45 + 0.15)
      const ring = line(Array.from({ length: 64 }, (_, i) => new THREE.Vector3(cx + Math.cos((i / 64) * Math.PI * 2) * r, 0, cz + Math.sin((i / 64) * Math.PI * 2) * r)), { closed: true })
      ring.scale.setScalar(scale)
      group.add(ring)
    } else if (obj.type === 'building') {
      const kit = this.editor.library.kits.get(String(obj.props.get('kit')))
      const cs = kit?.cellSize ?? 3
      const cells = BuildingLayout.fromObject(obj).cells(0)
      const has = (x: number, z: number) => cells.has(`${x},${z}`)
      // Each outer edge of the ground floor, pushed out (and stretched) by m so the walls don't
      // hide it.
      const m = 0.35
      const pts: THREE.Vector3[] = []
      const seg = (ax: number, az: number, bx: number, bz: number) => pts.push(new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz))
      for (const c of cells.values()) {
        const [x0, z0, x1, z1] = [c.x * cs, c.y * cs, (c.x + 1) * cs, (c.y + 1) * cs]
        if (!has(c.x, c.y - 1)) seg(x0 - m, z0 - m, x1 + m, z0 - m)
        if (!has(c.x, c.y + 1)) seg(x0 - m, z1 + m, x1 + m, z1 + m)
        if (!has(c.x - 1, c.y)) seg(x0 - m, z0 - m, x0 - m, z1 + m)
        if (!has(c.x + 1, c.y)) seg(x1 + m, z0 - m, x1 + m, z1 + m)
      }
      if (!pts.length) return null
      group.add(line(pts, { segments: true }))
    } else if (obj.type === 'water') {
      const polygon = obj.props.get('polygon')
      if (!(polygon instanceof PackedVec2Array)) return null
      const ring = (pts: PackedVec2Array) => line(pts.points.map((p) => new THREE.Vector3(p.x, 0, p.y)), { closed: true })
      group.add(ring(polygon))
      const holes = obj.props.get('holes')
      if (Array.isArray(holes)) for (const h of holes) if (h instanceof PackedVec2Array) group.add(ring(h))
    } else return null
    return group
  }
}
