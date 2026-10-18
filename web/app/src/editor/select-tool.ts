// Default tool (port of SelectTool). Click selects (Shift toggles), drag on empty ground
// box-selects, drag a selected object to move the selection (with snapping; a single prop
// re-seats onto surfaces, ground-standing props follow the terrain, buildings snap to their kit
// grid). Keys: R / Shift+R rotate, PageUp / PageDown (or = / -) raise / lower 0.25 m (Shift: 1 m),
// Delete remove, Cmd+D duplicate, Cmd+C / Cmd+V copy/paste, I pick the prop under the cursor,
// F focus the selection, Esc deselect. Objects sitting on a selected object (children) move,
// rotate, copy and delete with it.

import * as THREE from 'three'
import { copy, terrainEdit, Vec3, withDescendants, type Value } from '@pixel-arena/core'
import { snapProp } from '../library/library'
import type { Editor, Pointer, Tool } from './editor'
import { PlaceTool } from './place-tool'

type Mode = 'none' | 'pending' | 'move' | 'box'
const DRAG_THRESHOLD = 4

interface Snapshot {
  id: string
  type: string
  props: Record<string, Value>
  root: boolean
}

/** Shared between select tool instances so copy/paste survives tool switches. */
let clipboard: Snapshot[] = []

export class SelectTool implements Tool {
  readonly name = 'select'
  private mode: Mode = 'none'
  private pressAt: Pointer | null = null
  private pressHit: string | null = null
  // Move state
  private moving: string[] = []
  private starts = new Map<string, Vec3>()
  private primary = ''
  private grabOffset = new THREE.Vector3()
  private primaryGrounded = false
  private delta = new Vec3(0, 0, 0)
  /** For single-root moves: the new parent ("" = ground); null = keep parents. */
  private newParent: string | null = null

  constructor(private editor: Editor) {}

  deactivate() {
    this.cancelMove()
    this.editor.box.emit(null)
  }

  pointerDown(p: Pointer) {
    this.pressAt = p
    this.pressHit = this.editor.pick(p)?.id ?? null
    const sel = this.editor.selection
    if (p.shift && this.pressHit) {
      sel.toggle(this.pressHit)
      this.mode = 'none'
      return
    }
    if (this.pressHit && !sel.has(this.pressHit)) sel.set([this.pressHit])
    this.mode = 'pending'
  }

  pointerMove(p: Pointer) {
    if (this.mode === 'pending' && this.pressAt && Math.hypot(p.x - this.pressAt.x, p.y - this.pressAt.y) >= DRAG_THRESHOLD) {
      if (this.pressHit) this.startMove()
      else this.mode = 'box'
    }
    if (this.mode === 'move') this.updateMove(p)
    else if (this.mode === 'box') this.editor.box.emit(rect(this.pressAt!, p))
  }

  pointerUp(p: Pointer) {
    if (this.mode === 'pending' && !this.pressHit && !p.shift) this.editor.selection.clear()
    else if (this.mode === 'move') this.commitMove()
    else if (this.mode === 'box') {
      this.boxSelect(rect(this.pressAt!, p), p.shift)
      this.editor.box.emit(null)
    }
    this.mode = 'none'
  }

  key(e: KeyboardEvent): boolean {
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (k === 'escape') {
      if (this.mode === 'move') {
        this.cancelMove()
        this.mode = 'none'
      } else this.editor.selection.clear()
    } else if (k === 'delete' || k === 'backspace') this.deleteSelection()
    else if (k === 'r' && !cmd) this.rotateSelection(e.shiftKey ? -1 : 1)
    else if ((k === 'pageup' || k === '=') && !cmd) this.raiseSelection(e.shiftKey ? 1 : 0.25)
    else if ((k === 'pagedown' || k === '-') && !cmd) this.raiseSelection(e.shiftKey ? -1 : -0.25)
    else if (k === 'd' && cmd) this.duplicateSelection()
    else if (k === 'c' && cmd) this.copySelection()
    else if (k === 'v' && cmd) this.paste()
    else if (k === 'i' && !cmd) this.eyedropper()
    else if (k === 'f' && !cmd) this.focusSelection()
    else return false
    return true
  }

  // --- Move ------------------------------------------------------------------------------

  private startMove() {
    this.mode = 'move'
    const doc = this.editor.session.doc
    this.moving = withDescendants(doc, this.editor.selection.list())
    this.starts.clear()
    for (const id of this.moving) this.starts.set(id, (doc.getProp(id, 'position') as Vec3) ?? Vec3.ZERO)
    this.primary = this.pressHit!
    const p0 = this.starts.get(this.primary)!
    const ground = this.editor.groundAt(this.pressAt!)
    this.grabOffset = ground ? new THREE.Vector3(p0.x - ground.x, 0, p0.z - ground.z) : new THREE.Vector3()
    const obj = doc.getObject(this.primary)!
    this.primaryGrounded = obj.type === 'prop' && !obj.props.has('parent') && Math.abs(p0.y - terrainEdit.heightAtWorld(doc, p0.x, p0.z)) < 0.05
    this.delta = new Vec3(0, 0, 0)
    this.newParent = null
  }

  private updateMove(p: Pointer) {
    const { doc } = this.editor.session
    const start = this.starts.get(this.primary)!
    const obj = doc.getObject(this.primary)!
    const singleRoot = this.editor.selection.size === 1
    const prop = obj.type === 'prop' ? this.editor.library.props.get(String(obj.props.get('prop'))) : undefined
    const kit = obj.type === 'building' ? this.editor.library.kits.get(String(obj.props.get('kit'))) : undefined
    const yaw = Number(obj.props.get('rotation') ?? 0)
    this.newParent = null

    let target: THREE.Vector3
    let onSurface = false
    const surface = singleRoot && prop?.align === 'surface' ? this.editor.pick(p, new Set(this.moving)) : null
    if (surface?.id && surface.normal.y > 0.7) {
      target = surface.point.clone()
      this.newParent = surface.id
      onSurface = true
    } else {
      const ground = this.editor.groundAt(p)
      if (!ground) return
      target = ground.add(this.grabOffset)
      target.y = start.y
      if (singleRoot && obj.type === 'prop') this.newParent = ''
    }
    if (prop) {
      const [x, z] = snapProp(prop, target.x, target.z, yaw, p.cmd || (onSurface && prop.mode === 'grid'))
      target.set(x, target.y, z)
    } else if (kit && !p.cmd) {
      target.set(Math.round(target.x / kit.cellSize) * kit.cellSize, target.y, Math.round(target.z / kit.cellSize) * kit.cellSize)
    } else if (!p.cmd) {
      target.set(Math.round(target.x * 2) / 2, target.y, Math.round(target.z * 2) / 2)
    }
    if (!onSurface && (this.primaryGrounded || this.newParent === '')) target.y = terrainEdit.heightAtWorld(doc, target.x, target.z)

    this.delta = new Vec3(target.x - start.x, target.y - start.y, target.z - start.z)
    for (const id of this.moving) {
      const s = this.starts.get(id)!
      this.editor.world.preview(id, new THREE.Vector3(s.x + this.delta.x, s.y + this.delta.y, s.z + this.delta.z), Number(doc.getProp(id, 'rotation') ?? 0))
    }
  }

  private commitMove() {
    const s = this.editor.session
    const { moving, delta, primary, newParent, starts } = this
    this.moving = []
    s.edit('Move', () => {
      if (delta.x || delta.y || delta.z) for (const id of moving) s.setProp(id, 'position', starts.get(id)!.add(delta))
      if (newParent !== null) {
        const value = newParent === '' ? null : newParent
        if ((s.doc.getProp(primary, 'parent') ?? null) !== value) s.setProp(primary, 'parent', value)
      }
    })
    for (const id of moving) this.editor.world.invalidate(id)
  }

  private cancelMove() {
    for (const id of this.moving) this.editor.world.invalidate(id)
    this.moving = []
  }

  // --- Commands --------------------------------------------------------------------------

  private boxSelect(r: { x: number; y: number; w: number; h: number }, add: boolean) {
    const picked = new Set(add ? this.editor.selection.list() : [])
    const { pixel, rig } = this.editor
    for (const obj of this.editor.session.doc.objects.values()) {
      const pos = obj.props.get('position')
      if (obj.deleted || !(pos instanceof Vec3)) continue
      const sp = pixel.toScreen(new THREE.Vector3(pos.x, pos.y, pos.z), rig)
      if (sp && sp.x >= r.x && sp.x <= r.x + r.w && sp.y >= r.y && sp.y <= r.y + r.h) picked.add(obj.id)
    }
    this.editor.selection.set(picked)
  }

  private deleteSelection() {
    const sel = this.editor.selection
    if (sel.size === 0) return
    const s = this.editor.session
    const ids = withDescendants(s.doc, sel.list())
    s.edit('Delete', () => ids.forEach((id) => s.deleteObject(id)))
  }

  /** Rotates the selection about its centroid by one snap step of the first selected prop. */
  private rotateSelection(direction: number) {
    const roots = this.editor.selection.list()
    if (roots.length === 0) return
    const s = this.editor.session
    const first = s.doc.getObject(roots[0])!
    const prop = first.type === 'prop' ? this.editor.library.props.get(String(first.props.get('prop'))) : undefined
    const angle = (((prop?.rotateSnapDeg ?? 90) * Math.PI) / 180) * direction
    const pivot = this.centroid(roots)
    const ids = withDescendants(s.doc, roots)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    s.edit('Rotate', () => {
      for (const id of ids) {
        const p = (s.doc.getProp(id, 'position') as Vec3) ?? Vec3.ZERO
        const ox = p.x - pivot.x
        const oz = p.z - pivot.z
        // Same convention as Godot's Vector3.rotated(UP, angle).
        s.setProp(id, 'position', new Vec3(pivot.x + ox * cos + oz * sin, p.y, pivot.z - ox * sin + oz * cos))
        s.setProp(id, 'rotation', THREE.MathUtils.euclideanModulo(Number(s.doc.getProp(id, 'rotation') ?? 0) + angle + Math.PI, Math.PI * 2) - Math.PI)
      }
    })
  }

  private raiseSelection(dy: number) {
    const sel = this.editor.selection
    if (sel.size === 0) return
    const s = this.editor.session
    const ids = withDescendants(s.doc, sel.list())
    s.edit(dy > 0 ? 'Raise' : 'Lower', () => {
      for (const id of ids) s.setProp(id, 'position', ((s.doc.getProp(id, 'position') as Vec3) ?? Vec3.ZERO).add(new Vec3(0, dy, 0)))
    })
  }

  private duplicateSelection() {
    const roots = this.editor.selection.list()
    if (roots.length === 0) return
    const first = this.editor.session.doc.getObject(roots[0])!
    const prop = first.type === 'prop' ? this.editor.library.props.get(String(first.props.get('prop'))) : undefined
    const kit = first.type === 'building' ? this.editor.library.kits.get(String(first.props.get('kit'))) : undefined
    const step = prop?.mode === 'grid' ? prop.step : (kit?.cellSize ?? 1)
    this.editor.selection.set(this.instantiate(this.snapshot(roots), new Vec3(step, 0, step), 'Duplicate'))
  }

  private copySelection() {
    if (this.editor.selection.size > 0) clipboard = this.snapshot(this.editor.selection.list())
  }

  private paste() {
    if (clipboard.length === 0) return
    const ground = this.editor.groundAt(this.editor.cursor)
    if (!ground) return
    const roots = clipboard.filter((c) => c.root)
    const cx = roots.reduce((a, c) => a + (c.props.position as Vec3).x, 0) / Math.max(roots.length, 1)
    const cz = roots.reduce((a, c) => a + (c.props.position as Vec3).z, 0) / Math.max(roots.length, 1)
    const offset = new Vec3(Math.round(ground.x * 2) / 2 - cx, 0, Math.round(ground.z * 2) / 2 - cz)
    this.editor.selection.set(this.instantiate(clipboard, offset, 'Paste'))
  }

  private eyedropper() {
    const hit = this.editor.pick(this.editor.cursor)
    const obj = hit?.id ? this.editor.session.doc.getObject(hit.id) : undefined
    const prop = obj?.type === 'prop' ? this.editor.library.props.get(String(obj.props.get('prop'))) : undefined
    if (!prop) return
    const tool = new PlaceTool(this.editor, prop)
    tool.yaw = Number(obj!.props.get('rotation') ?? 0)
    this.editor.selection.clear()
    this.editor.setTool(tool)
  }

  private focusSelection() {
    const ids = this.editor.selection.list()
    if (ids.length === 0) return
    const c = this.centroid(ids)
    this.editor.rig.focus.set(c.x, 0, c.z)
  }

  /** Copies of the given objects and their descendants. */
  private snapshot(roots: string[]): Snapshot[] {
    const doc = this.editor.session.doc
    const rootSet = new Set(roots)
    return withDescendants(doc, roots).map((id) => {
      const obj = doc.getObject(id)!
      const props: Record<string, Value> = {}
      for (const [k, v] of obj.props) props[k] = copy(v)
      return { id, type: obj.type, props, root: rootSet.has(id) }
    })
  }

  /** Creates copies offset by `offset`, remapping parents inside the copied set. Returns the new
   *  root ids. */
  private instantiate(items: Snapshot[], offset: Vec3, label: string): string[] {
    const s = this.editor.session
    const remap = new Map<string, string>()
    const roots: string[] = []
    s.edit(label, () => {
      for (const item of items) {
        const { parent: _parent, ...props } = item.props
        props.position = ((props.position as Vec3) ?? Vec3.ZERO).add(offset)
        const id = s.createObject(item.type, props)
        remap.set(item.id, id)
        if (item.root) roots.push(id)
      }
      for (const item of items) {
        const parent = item.props.parent
        if (typeof parent === 'string' && remap.has(parent)) s.setProp(remap.get(item.id)!, 'parent', remap.get(parent)!)
      }
    })
    return roots
  }

  private centroid(ids: string[]): Vec3 {
    let x = 0
    let z = 0
    for (const id of ids) {
      const p = (this.editor.session.doc.getProp(id, 'position') as Vec3) ?? Vec3.ZERO
      x += p.x
      z += p.z
    }
    return new Vec3(x / ids.length, 0, z / ids.length)
  }
}

function rect(a: Pointer, b: Pointer) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}
