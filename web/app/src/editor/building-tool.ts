// Builds modular buildings on the kit's grid (port of BuildingTool). Modes:
//   foundation  drag to add cells on the current level. On level 0, painting away from the
//               target building (not touching its footprint) starts a new building.
//   erase       drag to remove cells (a building with no cells left is deleted).
//   wall        click an edge: toggles wall / open (exterior edges get walls automatically; an
//               edge between two cells is an interior wall).
//   door/window/doorway  click an edge to make it one; click again for a plain wall.
//   room        drag over cells to give them a room type (params.build.room; none clears it).
//   stairs      click a cell: stairs from it up to the next level, rising toward the cell side
//               nearest the cursor (over the kit's stairs run); click the same way again to
//               remove them. Only edge kits with a stairs piece have stairs.
// PageUp / PageDown (or . / ,) change the level; everything above it is cut away.
// params.build holds the kit, piece and level. Roof style and kit apply to the target building.
// Esc puts the tool down.

import * as THREE from 'three'
import { BuildingLayout, STAIR_STEP, Vec2i, Vec3, type StairDir, type Value } from '@pixel-arena/core'
import type { KitDef } from '../library/library'
import type { Editor, Pointer, Tool } from './editor'
import { buildLabel } from './labels'
import { MAX_LEVEL, params, paramsChanged, setParams } from './tool-params'

export class BuildingTool implements Tool {
  readonly name = 'build'
  /** The building being edited ("" until one is picked or started). */
  target = ''
  private painting = false
  private offParams = () => {}
  private hover: THREE.Mesh

  constructor(private editor: Editor) {
    this.hover = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffd84d', transparent: true, opacity: 0.45, depthTest: false }),
    )
    this.hover.renderOrder = 10
    this.hover.visible = false
  }

  activate() {
    const doc = this.editor.session.doc
    this.target = this.editor.selection.list().find((id) => doc.getObject(id)?.type === 'building') ?? ''
    this.editor.scene.add(this.hover)
    this.editor.world.setCutaway(params.build.level)
    this.pointerMove(this.editor.cursor)
    // The level can change from the bottom bar or a saved tool, not just the keys.
    this.offParams = paramsChanged.connect((tool) => {
      if (tool !== 'build') return
      this.editor.world.setCutaway(params.build.level)
      this.pointerMove(this.editor.cursor)
    })
  }

  deactivate() {
    this.offParams()
    if (this.painting) this.endStroke()
    this.editor.scene.remove(this.hover)
    this.editor.world.setCutaway(this.editor.viewCutaway)
  }

  kit(): KitDef | undefined {
    const kits = this.editor.library.kits
    const id = this.hasTarget() ? String(this.editor.session.doc.getProp(this.target, 'kit', params.build.kit)) : params.build.kit
    return kits.get(id) ?? kits.values().next().value
  }

  setLevel(level: number) {
    setParams('build', { level: Math.max(0, Math.min(MAX_LEVEL, level)) })
  }

  setRoof(style: string) {
    if (!this.hasTarget()) return
    const s = this.editor.session
    s.edit(`Set roof to ${style}`, () => s.setProp(this.target, 'roof/style', style))
  }

  setKit(id: string) {
    setParams('build', { kit: id })
    if (!this.hasTarget()) return
    const s = this.editor.session
    s.edit(`Change kit to ${this.editor.library.kits.get(id)?.name ?? id}`, () => s.setProp(this.target, 'kit', id))
  }

  // --- Input -----------------------------------------------------------------------------

  pointerDown(p: Pointer) {
    const hit = this.editor.pick(p)
    if (hit?.id && this.editor.session.doc.getObject(hit.id)?.type === 'building') this.target = hit.id
    if (params.build.piece === 'foundation' || params.build.piece === 'erase' || params.build.piece === 'room') {
      this.painting = true
      this.editor.session.begin(buildLabel(params.build.piece))
      this.paint(p, true)
    } else if (params.build.piece === 'stairs') this.clickStairs(p)
    else this.clickEdge(p)
  }

  pointerMove(p: Pointer) {
    if (this.painting) this.paint(p, false)
    this.updateHover(p)
  }

  pointerUp() {
    if (this.painting) this.endStroke()
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'PageUp' || e.key === '.') this.setLevel(params.build.level + 1)
    else if (e.key === 'PageDown' || e.key === ',') this.setLevel(params.build.level - 1)
    else if (e.key === 'Escape') this.editor.setTool(this.editor.defaultTool())
    else return false
    return true
  }

  // --- Editing ---------------------------------------------------------------------------

  private paint(p: Pointer, strokeStart: boolean) {
    const k = this.kit()
    if (!k) return
    const s = this.editor.session
    if (params.build.piece === 'foundation' && params.build.level === 0 && strokeStart) {
      const ground = this.editor.groundAt(p)
      if (ground && (!this.hasTarget() || !this.touchesFootprint(ground))) this.startBuilding(ground, k)
    }
    if (!this.hasTarget()) return
    const local = this.localHit(p)
    if (!local) return
    const cell = new Vec2i(Math.floor(local.x / k.cellSize), Math.floor(local.z / k.cellSize))
    const path = BuildingLayout.cellPath(params.build.level, cell)
    const present = s.doc.getProp(this.target, path) !== null
    if (params.build.piece === 'room') {
      const room = params.build.room === 'none' ? null : params.build.room
      const roomPath = BuildingLayout.roomPath(params.build.level, cell)
      if (present && s.doc.getProp(this.target, roomPath) !== room) s.setProp(this.target, roomPath, room)
      return
    }
    if (params.build.piece === 'foundation' && !present) s.setProp(this.target, path, true)
    else if (params.build.piece === 'erase' && present) s.setProp(this.target, path, null)
  }

  private endStroke() {
    this.painting = false
    const s = this.editor.session
    if (this.hasTarget() && BuildingLayout.fromObject(s.doc.getObject(this.target)!).isEmpty()) {
      s.deleteObject(this.target)
      this.target = ''
    }
    s.commit()
    if (this.hasTarget()) this.editor.selection.set([this.target])
  }

  private startBuilding(ground: THREE.Vector3, k: KitDef) {
    const origin = new Vec3(Math.floor(ground.x / k.cellSize) * k.cellSize, ground.y, Math.floor(ground.z / k.cellSize) * k.cellSize)
    this.target = this.editor.session.createObject('building', { kit: k.id, position: origin, rotation: 0, 'roof/style': 'gable' })
  }

  private clickEdge(p: Pointer) {
    if (!this.hasTarget()) return
    const edge = this.edgeAt(p)
    if (!edge) return
    const s = this.editor.session
    const layout = BuildingLayout.fromObject(s.doc.getObject(this.target)!)
    const level = params.build.level
    const [ca, cb] = BuildingLayout.edgeCells(edge)
    const a = layout.cells(level).has(ca.key)
    const b = layout.cells(level).has(cb.key)
    if (!a && !b) return
    const auto = a !== b ? 'wall' : ''
    const current = layout.effectiveKind(level, edge)
    let value: Value
    if (params.build.piece === 'wall') value = current !== '' ? (auto === 'wall' ? 'open' : null) : auto === 'wall' ? null : 'wall'
    else {
      const kind = params.build.piece
      value = current === kind ? (auto === 'wall' ? null : 'wall') : kind
    }
    s.edit(buildLabel(params.build.piece), () => s.setProp(this.target, BuildingLayout.wallPath(level, edge), value))
  }

  /** The cell under the cursor and the side of it nearest the cursor. */
  private cellSide(p: Pointer): { cell: Vec2i; dir: StairDir } | null {
    const local = this.localHit(p)
    if (!local) return null
    const cs = this.kit()!.cellSize
    const fx = local.x / cs
    const fz = local.z / cs
    const cell = new Vec2i(Math.floor(fx), Math.floor(fz))
    const u = fx - cell.x - 0.5
    const v = fz - cell.y - 0.5
    const dir: StairDir = Math.abs(u) > Math.abs(v) ? (u > 0 ? 'E' : 'W') : v > 0 ? 'S' : 'N'
    return { cell, dir }
  }

  private clickStairs(p: Pointer) {
    if (!this.hasTarget() || this.kit()?.style !== 'edge' || !this.kit()?.pieces.stairs?.length) return
    const at = this.cellSide(p)
    if (!at) return
    const s = this.editor.session
    const level = params.build.level
    const layout = BuildingLayout.fromObject(s.doc.getObject(this.target)!)
    if (!layout.cells(level).has(at.cell.key)) return
    const current = layout.stairs(level).get(at.cell.key)
    const value: Value = current?.dir === at.dir ? null : at.dir
    s.edit(value ? buildLabel('stairs') : 'Remove stairs', () => s.setProp(this.target, BuildingLayout.stairsPath(level, at.cell), value))
  }

  // --- Geometry --------------------------------------------------------------------------

  hasTarget(): boolean {
    return this.target !== '' && this.editor.session.doc.hasObject(this.target)
  }

  private xform(): THREE.Matrix4 {
    const doc = this.editor.session.doc
    const p = (doc.getProp(this.target, 'position') as Vec3) ?? Vec3.ZERO
    const yaw = Number(doc.getProp(this.target, 'rotation') ?? 0)
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))
  }

  /** Building-local point where the cursor ray meets the current level's floor plane. */
  private localHit(p: Pointer): THREE.Vector3 | null {
    const k = this.kit()!
    const m = this.xform()
    const origin = new THREE.Vector3().setFromMatrixPosition(m)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(origin.y + params.build.level * k.wallHeight))
    const hit = this.editor.ray(p).intersectPlane(plane, new THREE.Vector3())
    return hit ? hit.applyMatrix4(m.clone().invert()) : null
  }

  /** Nearest cell edge to the cursor on the current level ("" if none). */
  private edgeAt(p: Pointer): string {
    const local = this.localHit(p)
    if (!local) return ''
    const cs = this.kit()!.cellSize
    const fx = local.x / cs
    const fz = local.z / cs
    if (Math.abs(fx - Math.round(fx)) < Math.abs(fz - Math.round(fz))) return `${Math.round(fx)},${Math.floor(fz)},W`
    return `${Math.floor(fx)},${Math.round(fz)},N`
  }

  /** True if the world point is on or next to the target building's level-0 footprint. */
  private touchesFootprint(world: THREE.Vector3): boolean {
    const k = this.kit()!
    const local = world.clone().applyMatrix4(this.xform().invert())
    const c = new Vec2i(Math.floor(local.x / k.cellSize), Math.floor(local.z / k.cellSize))
    const cells = BuildingLayout.fromObject(this.editor.session.doc.getObject(this.target)!).cells(0)
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => cells.has(c.add(new Vec2i(dx, dz)).key))
  }

  private updateHover(p: Pointer) {
    const k = this.kit()
    this.hover.visible = false
    if (!k) return
    const cs = k.cellSize
    const h = k.wallHeight
    let m: THREE.Matrix4
    let local: THREE.Vector3 | null
    if (this.hasTarget()) {
      m = this.xform()
      local = this.localHit(p)
    } else {
      const ground = this.editor.groundAt(p)
      if (!ground) return
      m = new THREE.Matrix4().makeTranslation(0, ground.y, 0)
      local = new THREE.Vector3(ground.x, 0, ground.z)
    }
    if (!local) return
    const y = params.build.level * h
    let size: THREE.Vector3
    let center: THREE.Vector3
    if (params.build.piece === 'foundation' || params.build.piece === 'erase' || params.build.piece === 'room') {
      const cx = Math.floor(local.x / cs)
      const cz = Math.floor(local.z / cs)
      size = new THREE.Vector3(cs, 0.25, cs)
      center = new THREE.Vector3((cx + 0.5) * cs, y + 0.12, (cz + 0.5) * cs)
    } else if (params.build.piece === 'stairs') {
      // The whole run, rising toward the side nearest the cursor.
      const at = this.hasTarget() ? this.cellSide(p) : null
      if (!at || k.style !== 'edge') return
      const run = k.stairsCells
      const [dx, dz] = STAIR_STEP[at.dir]
      const along = (run - 1) / 2
      size = dx ? new THREE.Vector3(cs * run, h * 0.5, cs * 0.5) : new THREE.Vector3(cs * 0.5, h * 0.5, cs * run)
      center = new THREE.Vector3((at.cell.x + 0.5 + dx * along) * cs, y + h * 0.25, (at.cell.y + 0.5 + dz * along) * cs)
    } else if (this.hasTarget()) {
      const [i, j, side] = this.edgeAt(p).split(',')
      const x = Number(i)
      const z = Number(j)
      size = side === 'W' ? new THREE.Vector3(0.3, h, cs) : new THREE.Vector3(cs, h, 0.3)
      center = side === 'W' ? new THREE.Vector3(x * cs, y + h / 2, (z + 0.5) * cs) : new THREE.Vector3((x + 0.5) * cs, y + h / 2, z * cs)
    } else return
    this.hover.matrixAutoUpdate = false
    this.hover.matrix.copy(m).multiply(new THREE.Matrix4().compose(center, new THREE.Quaternion(), size))
    this.hover.visible = true
  }
}
