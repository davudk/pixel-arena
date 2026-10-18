// Selection marks on the ground, like units in a strategy game: a thin ring around the base of
// each selected prop (sized to its footprint), the footprint outline of a building, and the
// shoreline of a body of water (with its islands). A selected group marks its members. Locked
// objects are marked in grey. Lines are one low-res texel wide, so they stay crisp in the pixel
// pass; they're depth-tested, so the object itself hides the part of the ring behind it.

import * as THREE from 'three'
import { BuildingLayout, PackedVec2Array, Vec3, type MapObject, type MapSession } from '@pixel-arena/core'
import type { Editor } from './editor'
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
      const mark = this.markFor(obj)
      if (!mark) continue
      const color = isLocked(doc, id) ? LOCKED : ACCENT
      mark.traverse((o) => {
        const line = o as THREE.Line
        if (line.isLine) line.material = new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false })
        o.renderOrder = 5
        o.raycast = () => {}
      })
      this.root.add(mark)
    }
  }

  /** The mark in the object's own frame, placed like the object. */
  private markFor(obj: MapObject): THREE.Object3D | null {
    const pos = obj.props.get('position')
    if (!(pos instanceof Vec3)) return null
    const group = new THREE.Group()
    group.position.set(pos.x, pos.y + LIFT, pos.z)
    group.rotation.y = Number(obj.props.get('rotation') ?? 0)
    if (obj.type === 'prop') {
      const prop = this.editor.library.props.get(String(obj.props.get('prop')))
      const [w, d] = prop?.footprint ?? [1, 1]
      const scale = Number(obj.props.get('scale') ?? 1)
      const r = Math.max(0.35, Math.hypot(w, d) * 0.45 + 0.15) * scale
      group.add(loop(Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * Math.PI * 2) * r, Math.sin((i / 48) * Math.PI * 2) * r])))
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
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts)))
    } else if (obj.type === 'water') {
      const polygon = obj.props.get('polygon')
      if (!(polygon instanceof PackedVec2Array)) return null
      group.add(loop(polygon.points.map((p) => [p.x, p.y])))
      const holes = obj.props.get('holes')
      if (Array.isArray(holes)) for (const h of holes) if (h instanceof PackedVec2Array) group.add(loop(h.points.map((p) => [p.x, p.y])))
    } else return null
    return group
  }
}

/** A closed line through local (x, z) points on the mark's plane. */
function loop(points: [number, number][] | number[][]): THREE.LineLoop {
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 0, z))))
}
