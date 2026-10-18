// Axes through an object's origin while one of Selection's X / Y / Z fields has focus: X red,
// Y green, Z blue (the colors of the field letters), solid toward + with an arrow tip, dashed
// toward -. The focused axis is bright; the other two faint. Drawn over everything, at a
// constant on-screen size for tips and dashes. The letters are page text over the canvas (crisp,
// not pixelated): X and Z lie flat on the ground (skewed like the ground is in this view), Y
// stands upright; they follow the view every frame.

import * as THREE from 'three'
import { BuildingLayout, PackedVec2Array, Vec3 } from '@pixel-arena/core'
import type { Editor } from './editor'

export type Axis = 'x' | 'y' | 'z'
export const AXIS_COLORS: Record<Axis, string> = { x: '#e5484d', y: '#46a758', z: '#3e8ef7' }

export class AxesGizmo {
  private root = new THREE.Group()
  private shown: { id: string; axis: Axis } | null = null
  private drawnZoom = 0
  /** Letter positions in world space (set by redraw), and their elements over the canvas. */
  private letters: { axis: Axis; at: THREE.Vector3; el: HTMLDivElement }[] = []

  constructor(private editor: Editor) {
    this.root.renderOrder = 20
    this.root.userData.overlay = true // not in exports
    editor.scene.add(this.root)
  }

  show(id: string, axis: Axis) {
    this.shown = { id, axis }
    this.redraw()
  }

  hide() {
    this.shown = null
    this.redraw()
  }

  /** Each frame: follows zoom (constant on-screen sizes) and keeps the letters on their tips. */
  update() {
    if (this.shown && this.editor.rig.zoom !== this.drawnZoom) this.redraw()
    const { pixel, rig } = this.editor
    for (const l of this.letters) {
      const p = pixel.toScreen(l.at, rig)
      if (!p) continue
      let transform = 'translate(-50%, -50%)'
      if (l.axis !== 'y') {
        // The ground's own axes on screen: text right = +X, text up = -Z (north).
        const ex = pixel.toScreen(l.at.clone().add(new THREE.Vector3(1, 0, 0)), rig)!.sub(p)
        const ez = pixel.toScreen(l.at.clone().add(new THREE.Vector3(0, 0, -1)), rig)!.sub(p)
        const k = Math.max(ex.length(), ez.length(), 1e-6)
        transform += ` matrix(${ex.x / k}, ${ex.y / k}, ${-ez.x / k}, ${-ez.y / k}, 0, 0)`
      }
      l.el.style.left = `${p.x}px`
      l.el.style.top = `${p.y}px`
      l.el.style.transform = transform
    }
  }

  /** The object moved (its field was edited). */
  refresh() {
    if (this.shown) this.redraw()
  }

  private clear() {
    for (const l of this.letters) l.el.remove()
    this.letters = []
    for (const child of [...this.root.children]) {
      this.root.remove(child)
      child.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material & { map?: THREE.Texture }
        mat?.map?.dispose()
        mat?.dispose?.()
      })
    }
  }

  private redraw() {
    this.clear()
    this.drawnZoom = this.editor.rig.zoom
    if (!this.shown) return
    const obj = this.editor.session.doc.getObject(this.shown.id)
    const pos = obj?.props.get('position')
    if (!obj || !(pos instanceof Vec3)) return
    const px = this.editor.rig.zoom / Math.max(1, this.editor.pixel.canvas.clientHeight) // m per CSS px
    const len = Math.max(2, this.extent(obj.id) / 2 + 1.2)
    const origin = new THREE.Vector3(pos.x, pos.y, pos.z)
    const add = (o: THREE.Object3D) => {
      o.renderOrder = 20
      o.raycast = () => {}
      this.root.add(o)
    }
    for (const axis of ['x', 'y', 'z'] as Axis[]) {
      const on = axis === this.shown.axis
      const color = new THREE.Color(AXIS_COLORS[axis])
      const opacity = on ? 1 : 0.35
      const dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      const tip = origin.clone().addScaledVector(dir, len)
      const mat = () => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
      add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, tip]), mat()))
      if (axis !== 'y') {
        const back = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, origin.clone().addScaledVector(dir, -len)]),
          new THREE.LineDashedMaterial({ color, transparent: true, opacity: opacity * 0.8, depthTest: false, depthWrite: false, dashSize: 6 * px, gapSize: 5 * px }))
        back.computeLineDistances()
        add(back)
      }
      // Arrow tip.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7 * px, 18 * px, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }))
      cone.position.copy(tip)
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      add(cone)
      // Letter past the tip (page text; positioned in update()).
      const el = document.createElement('div')
      el.className = 'axis-letter'
      el.textContent = axis.toUpperCase()
      el.style.color = AXIS_COLORS[axis]
      el.style.opacity = on ? '1' : '0.55'
      el.style.fontSize = on ? '30px' : '22px'
      this.editor.pixel.canvas.parentElement?.appendChild(el)
      this.letters.push({ axis, at: tip.clone().addScaledVector(dir, 22 * px), el })
    }
  }

  /** The object's size across (m), for the axis length. */
  private extent(id: string): number {
    const obj = this.editor.session.doc.getObject(id)
    if (!obj) return 2
    if (obj.type === 'prop') {
      const f = this.editor.library.props.get(String(obj.props.get('prop')))?.footprint ?? [1, 1]
      return Math.max(f[0], f[1]) * Number(obj.props.get('scale') ?? 1)
    }
    if (obj.type === 'building') {
      const cs = this.editor.library.kits.get(String(obj.props.get('kit')))?.cellSize ?? 3
      const cells = [...BuildingLayout.fromObject(obj).cells(0).values()]
      if (!cells.length) return cs
      const xs = cells.map((c) => c.x)
      const zs = cells.map((c) => c.y)
      return (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 1) * cs
    }
    if (obj.type === 'water') {
      const p = obj.props.get('polygon')
      if (!(p instanceof PackedVec2Array) || !p.points.length) return 4
      const xs = p.points.map((v) => v.x)
      const zs = p.points.map((v) => v.y)
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    }
    return 2
  }
}
