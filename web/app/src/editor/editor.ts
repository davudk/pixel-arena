// Editor context shared by tools (port of EditorMain's role): the session, the scene views, the
// camera, picking, and the active tool. Camera input (pan/orbit/zoom) is handled before tools see
// anything; the left button and unhandled keys go to the active tool.

import * as THREE from 'three'
import { merge, Signal, terrainEdit, Vec3, type MapSession } from '@pixel-arena/core'
import type { Library } from '../library/library'
import type { Thumbnails } from '../library/thumbs'
import type { CameraRig, PixelRenderer } from '../render/pixel'
import type { WorldView } from '../world/world-view'
import { AxesGizmo } from './axes-gizmo'
import { Selection } from './selection'
import { SelectionMarks } from './selection-marks'

/** Pointer position in CSS pixels relative to the canvas, plus modifiers. */
export interface Pointer {
  x: number
  y: number
  shift: boolean
  alt: boolean
  /** Cmd on macOS, Ctrl elsewhere (disables snapping while placing / moving). */
  cmd: boolean
}

export interface Hit {
  point: THREE.Vector3
  normal: THREE.Vector3
  /** Object under the pointer, or null for terrain. */
  id: string | null
}

export interface Tool {
  readonly name: string
  activate?(): void
  deactivate?(): void
  pointerDown?(p: Pointer): void
  pointerMove?(p: Pointer): void
  pointerUp?(p: Pointer): void
  /** Return true if the key was used. */
  key?(e: KeyboardEvent): boolean
  update?(dt: number): void
}

/** Does nothing (used while switching maps). */
export const idleTool: Tool = { name: 'none' }

export interface BoxRect {
  x: number
  y: number
  w: number
  h: number
}

export class Editor {
  readonly toolChanged = new Signal<Tool>()
  readonly sessionChanged = new Signal<MapSession>()
  /** Box-select rectangle in CSS px (null hides it). */
  readonly box = new Signal<BoxRect | null>()
  readonly selection = new Selection()
  tool: Tool = idleTool
  /** Building level the view panel cuts away to (-1 = none); tools that change the cutaway
   *  restore it when they finish. */
  viewCutaway = -1
  /** Creates the tool to return to (the select tool; set by the app to avoid an import cycle). */
  defaultTool: () => Tool = () => idleTool
  cursor: Pointer = { x: 0, y: 0, shift: false, alt: false, cmd: false }
  /** Rings / outlines under the selection (selection-marks.ts). */
  readonly marks: SelectionMarks
  /** X / Y / Z axes while a position field is being edited (axes-gizmo.ts). */
  readonly axes: AxesGizmo
  private raycaster = new THREE.Raycaster()

  constructor(
    public session: MapSession,
    readonly library: Library,
    readonly thumbnails: Thumbnails,
    readonly world: WorldView,
    readonly rig: CameraRig,
    readonly pixel: PixelRenderer,
    readonly scene: THREE.Scene,
  ) {
    this.selection.changed.connect(() => world.setHighlights(this.selection.list()))
    this.selection.bind(session.doc)
    this.marks = new SelectionMarks(this)
    this.axes = new AxesGizmo(this)
  }

  setSession(s: MapSession) {
    this.setTool(idleTool)
    this.session = s
    this.selection.bind(s.doc)
    this.sessionChanged.emit(s)
    this.setTool(this.defaultTool())
  }

  // --- Branches (each op returns to the select tool so no tool holds ids from another branch)

  newBranch(fromBranch: string, seq: number, name: string): string {
    this.setTool(this.defaultTool())
    return seq < 0 ? this.session.fork(name) : this.session.forkAt(name, fromBranch, seq)
  }

  switchBranch(id: string) {
    this.setTool(this.defaultTool())
    this.session.switchBranch(id)
  }

  mergeBranch(id: string, resolutions: Record<string, merge.Resolution>) {
    this.setTool(this.defaultTool())
    return this.session.mergeBranch(id, resolutions, merge.THEIRS)
  }

  discardBranch(id: string) {
    this.setTool(this.defaultTool())
    return this.session.discardBranch(id)
  }

  setTool(tool: Tool) {
    this.tool.deactivate?.()
    this.tool = tool
    tool.activate?.()
    this.toolChanged.emit(tool)
  }

  /** World ray through a pointer position (camera-space origin pulled far back for ortho). */
  ray(p: Pointer): THREE.Ray {
    this.raycaster.setFromCamera(this.pixel.toNdc(p.x, p.y, this.rig), this.rig.camera)
    const r = this.raycaster.ray.clone()
    r.origin.addScaledVector(r.direction, -2000)
    return r
  }

  /** Terrain point under the pointer (heightfield raycast from the core). */
  groundAt(p: Pointer): THREE.Vector3 | null {
    const r = this.ray(p)
    const hit = terrainEdit.raycast(this.session.doc, new Vec3(r.origin.x, r.origin.y, r.origin.z), new Vec3(r.direction.x, r.direction.y, r.direction.z))
    return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : null
  }

  /** Nearest object or terrain under the pointer. */
  pick(p: Pointer, exclude: Set<string> = new Set()): Hit | null {
    const r = this.ray(p)
    this.raycaster.set(r.origin, r.direction)
    this.raycaster.far = Infinity
    const obj = this.world.pick(this.raycaster, exclude)
    const ground = this.groundAt(p)
    const groundDist = ground ? ground.distanceTo(r.origin) : Infinity
    if (obj && obj.distance <= groundDist) return { point: obj.point, normal: obj.normal, id: obj.id }
    return ground ? { point: ground, normal: new THREE.Vector3(0, 1, 0), id: null } : null
  }
}
