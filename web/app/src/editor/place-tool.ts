// Places the chosen prop (port of PlaceTool): a see-through ghost follows the cursor with the
// prop's snapping; click to place (repeatedly). Props that allow surface placement sit on
// whatever upward-facing surface is under the cursor and become its children. R / Shift+R
// rotate by the prop's snap angle, Cmd/Ctrl held (or params.place.snap off) disables snapping,
// params.place.randomRotation turns each placed copy randomly. Esc puts the tool down.

import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { snapping, terrainEdit, Vec3 } from '@pixel-arena/core'
import { snapProp, type PropDef } from '../library/library'
import { loadModel } from '../library/models'
import type { Editor, Pointer, Tool } from './editor'
import { placeLabel } from './labels'
import { params } from './tool-params'

export class PlaceTool implements Tool {
  readonly name = 'place'
  yaw = 0
  private ghost: THREE.Object3D | null = null
  private target: { position: THREE.Vector3; parent: string | null } | null = null
  private alive = true

  constructor(private editor: Editor, readonly prop: PropDef) {}

  activate() {
    void loadModel(this.prop).then((model) => {
      if (!this.alive) return
      const ghost = SkeletonUtils.clone(model.scene)
      ghost.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = false
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
          const c = m.clone()
          c.transparent = true
          c.opacity = 0.55
          c.depthWrite = false
          return c
        })
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0]
      })
      this.ghost = new THREE.Group().add(ghost)
      this.editor.scene.add(this.ghost)
      this.pointerMove(this.editor.cursor)
    })
  }

  deactivate() {
    this.alive = false
    if (this.ghost) this.editor.scene.remove(this.ghost)
  }

  pointerMove(p: Pointer) {
    this.target = this.compute(p)
    if (!this.ghost) return
    this.ghost.visible = this.target !== null
    if (this.target) {
      this.ghost.position.copy(this.target.position)
      this.ghost.rotation.y = this.yaw
    }
  }

  pointerDown(p: Pointer) {
    this.pointerMove(p)
    const t = this.target
    if (!t) return
    const s = this.editor.session
    s.edit(placeLabel(this.prop.name), () => {
      s.createObject('prop', {
        prop: this.prop.id,
        position: new Vec3(t.position.x, t.position.y, t.position.z),
        rotation: this.yaw,
        anim_offset: Math.random(),
        ...(t.parent ? { parent: t.parent } : {}),
      })
    })
    if (params.place.randomRotation) {
      this.yaw = snapping.snapYaw(Math.random() * Math.PI * 2, this.prop.rotateSnapDeg)
      this.pointerMove(p)
    }
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'r' || e.key === 'R') {
      const step = (Math.max(this.prop.rotateSnapDeg, 1) * Math.PI) / 180
      this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + (e.shiftKey ? -step : step) + Math.PI, Math.PI * 2) - Math.PI
      this.pointerMove(this.editor.cursor)
      return true
    }
    if (e.key === 'Escape') {
      this.editor.setTool(this.editor.defaultTool())
      return true
    }
    return false
  }

  private compute(p: Pointer): { position: THREE.Vector3; parent: string | null } | null {
    if (this.prop.align === 'surface') {
      const hit = this.editor.pick(p)
      if (hit?.id && hit.normal.y > 0.7) {
        // Grid props don't grid-snap on top of other objects.
        const [x, z] = snapProp(this.prop, hit.point.x, hit.point.z, this.yaw, p.cmd || !params.place.snap || this.prop.mode === 'grid')
        return { position: new THREE.Vector3(x, hit.point.y, z), parent: hit.id }
      }
    }
    const ground = this.editor.groundAt(p)
    if (!ground) return null
    const [x, z] = snapProp(this.prop, ground.x, ground.z, this.yaw, p.cmd || !params.place.snap)
    return { position: new THREE.Vector3(x, terrainEdit.heightAtWorld(this.editor.session.doc, x, z), z), parent: null }
  }
}
