// Places a premade building (library PremadeDef): a see-through ghost of the whole building, its
// furniture and yard follows the cursor, centered on it and snapped to the building grid (2 m);
// click to place (repeatedly), R / Shift+R turn it by 90°, Esc puts the tool down. Placed
// buildings are ordinary buildings with their furniture and yard as children (generated.ts).

import * as THREE from 'three'
import { terrainEdit, Vec3 } from '@pixel-arena/core'
import type { PremadeDef } from '../library/library'
import { premadeObject } from '../world/premade-visual'
import type { Editor, Pointer, Tool } from './editor'
import { placeGenerated } from './generated'

const GRID = 2

export class PremadeTool implements Tool {
  readonly name = 'premade'
  yaw = 0
  private ghost: THREE.Object3D | null = null
  private at: Vec3 | null = null
  private alive = true

  constructor(private editor: Editor, readonly def: PremadeDef) {}

  activate() {
    void premadeObject(this.def, this.editor.library).then((obj) => {
      if (!this.alive) return
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = false
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
          const c = m.clone()
          c.transparent = true
          c.opacity = 0.5
          c.depthWrite = false
          return c
        })
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0]
        o.raycast = () => {}
      })
      this.ghost = obj
      this.editor.scene.add(obj)
      this.pointerMove(this.editor.cursor)
    })
  }

  deactivate() {
    this.alive = false
    if (this.ghost) this.editor.scene.remove(this.ghost)
  }

  pointerMove(p: Pointer) {
    const ground = this.editor.groundAt(p)
    this.at = null
    if (ground) {
      // The building's middle under the cursor: its origin is a corner, turned by yaw.
      const [w, d] = this.def.size
      const cos = Math.cos(this.yaw)
      const sin = Math.sin(this.yaw)
      const ox = ground.x - ((w / 2) * cos + (d / 2) * sin)
      const oz = ground.z - (-(w / 2) * sin + (d / 2) * cos)
      const x = Math.round(ox / GRID) * GRID
      const z = Math.round(oz / GRID) * GRID
      this.at = new Vec3(x, terrainEdit.heightAtWorld(this.editor.session.doc, ground.x, ground.z), z)
    }
    if (!this.ghost) return
    this.ghost.visible = this.at !== null
    if (this.at) {
      this.ghost.position.set(this.at.x, this.at.y, this.at.z)
      this.ghost.rotation.y = this.yaw
    }
  }

  pointerDown(p: Pointer) {
    this.pointerMove(p)
    const at = this.at
    if (!at) return
    const s = this.editor.session
    s.edit(`Place ${this.def.name}`, () => {
      placeGenerated(s, { props: this.def.props, children: this.def.children }, at, this.yaw)
    })
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'r' || e.key === 'R') {
      this.yaw += (e.shiftKey ? -1 : 1) * (Math.PI / 2)
      this.pointerMove(this.editor.cursor)
      return true
    }
    if (e.key === 'Escape') {
      this.editor.setTool(this.editor.defaultTool())
      return true
    }
    return false
  }
}
