// A premade building as one scene object (building pieces, furniture, yard): for the placing
// ghost and thumbnails. On the map, placeGenerated() makes real objects instead.

import * as THREE from 'three'
import { MapObject } from '@pixel-arena/core'
import type { Library, PremadeDef } from '../library/library'
import { loadModel } from '../library/models'
import { buildBuilding } from './building-visuals'

export async function premadeObject(def: PremadeDef, library: Library): Promise<THREE.Group> {
  const obj = new MapObject('premade', 'building')
  for (const [k, v] of Object.entries(def.props)) obj.props.set(k, v)
  const root = new THREE.Group()
  root.add(await buildBuilding(obj, library))
  const models = new Map<string, THREE.Object3D | null>()
  for (const c of def.children) {
    if (!models.has(c.prop)) {
      const prop = library.props.get(c.prop)
      models.set(c.prop, prop ? (await loadModel(prop).catch(() => null))?.scene ?? null : null)
    }
    const m = models.get(c.prop)
    if (!m) continue
    const o = m.clone()
    const holder = new THREE.Group().add(o)
    holder.position.set(c.x, c.y, c.z)
    holder.rotation.y = c.rotation
    holder.scale.setScalar(c.scale ?? 1)
    root.add(holder)
  }
  return root
}
