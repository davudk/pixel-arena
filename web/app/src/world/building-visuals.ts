// Builds a building's scene from its BuildingLayout and kit: wall / window / door pieces on
// edges, floor tiles, a foundation under the lowest level and generated roofs. Port of
// BuildingVisuals. Each level is its own group (userData.level) and roofs are grouped per level
// (userData.roofLevel), so setCutaway() can hide everything above the level being edited.
//
// Building-local space: cell (i, j) of level L spans [i, i+1] x [j, j+1] * cellSize, floor at
// y = L * wallHeight. Kit wall pieces sit on a cell's +X edge; they're rotated per side.

import * as THREE from 'three'
import { BuildingLayout, type MapObject } from '@pixel-arena/core'
import type { KitDef, Library } from '../library/library'
import { loadModel } from '../library/models'
import { addRoof, MeshBuilder } from './roof-mesh'

const FOUNDATION_DEPTH = 2
const SIDE_YAW: Record<string, number> = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 }
const DEFAULT_COLORS = { roof: '#3f9e8f', gable: '#9a5b3e', foundation: '#8f8a84' }

let vertexMaterial: THREE.MeshLambertMaterial | null = null
function vertexColored(): THREE.MeshLambertMaterial {
  return (vertexMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))
}

export async function buildBuilding(obj: MapObject, library: Library): Promise<THREE.Group> {
  const root = new THREE.Group()
  const layout = BuildingLayout.fromObject(obj)
  const kit: KitDef | undefined = library.kits.get(String(obj.props.get('kit') ?? ''))
  const cs = kit?.cellSize ?? 3
  const h = kit?.wallHeight ?? 3
  const colors = kit?.colors ?? DEFAULT_COLORS
  const piece = async (role: 'wall' | 'window' | 'door' | 'floor') => {
    const id = kit?.pieces[role]
    const prop = id ? library.props.get(id) : undefined
    return prop ? loadModel(prop).catch(() => null) : null
  }
  const [wall, window, door, floor] = await Promise.all([piece('wall'), piece('window'), piece('door'), piece('floor')])
  const pieces: Record<string, typeof wall> = { wall, window, door }

  const levels = layout.levelIndices()
  for (const level of levels) {
    const group = new THREE.Group()
    group.userData.level = level
    root.add(group)
    const y = level * h
    for (const c of layout.cells(level).values()) {
      if (floor) group.add(place(floor.scene, new THREE.Vector3((c.x + 0.5) * cs, y, (c.y + 0.5) * cs), 0))
    }
    for (const w of layout.walls(level).values()) {
      const center = new THREE.Vector3((w.host.x + 0.5) * cs, y, (w.host.y + 0.5) * cs)
      const model = pieces[w.kind] ?? wall
      if (model) group.add(place(model.scene, center, SIDE_YAW[w.side]))
      else {
        const mb = new MeshBuilder()
        mb.box(new THREE.Vector3(cs * 0.4, 0, -cs * 0.5), new THREE.Vector3(cs * 0.5, h, cs * 0.5), new THREE.Color(colors.gable))
        const m = new THREE.Mesh(mb.build(), vertexColored())
        m.position.copy(center)
        m.rotation.y = SIDE_YAW[w.side]
        group.add(m)
      }
    }
    if (level === levels[0]) {
      const mb = new MeshBuilder()
      for (const c of layout.cells(level).values())
        mb.box(new THREE.Vector3(c.x * cs, y - FOUNDATION_DEPTH, c.y * cs), new THREE.Vector3((c.x + 1) * cs, y, (c.y + 1) * cs), new THREE.Color(colors.foundation))
      const m = new THREE.Mesh(mb.build(), vertexColored())
      m.castShadow = m.receiveShadow = true
      group.add(m)
    }
  }

  if (layout.roofStyle !== 'none') {
    for (const [level, rects] of layout.roofGroups()) {
      const mb = new MeshBuilder()
      for (const r of rects)
        addRoof(mb, { x: r.x * cs, y: r.y * cs, w: r.w * cs, h: r.h * cs }, (level + 1) * h, layout.roofStyle, new THREE.Color(colors.roof), new THREE.Color(colors.gable))
      if (mb.empty) continue
      const m = new THREE.Mesh(mb.build(), vertexColored())
      m.castShadow = m.receiveShadow = true
      m.userData.roofLevel = level
      root.add(m)
    }
  }
  return root
}

/** Shows levels up to `level` and roofs below it; -1 shows everything. */
export function setCutaway(root: THREE.Object3D, level: number) {
  for (const child of root.children) {
    if (child.userData.level !== undefined) child.visible = level < 0 || child.userData.level <= level
    else if (child.userData.roofLevel !== undefined) child.visible = level < 0 || child.userData.roofLevel < level
  }
}

function place(template: THREE.Object3D, position: THREE.Vector3, yaw: number): THREE.Object3D {
  const o = template.clone()
  const holder = new THREE.Group()
  holder.add(o)
  holder.position.copy(position)
  holder.rotation.y = yaw
  return holder
}
