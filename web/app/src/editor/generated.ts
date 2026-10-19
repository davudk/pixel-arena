// Puts a generated building (core building-gen) on the map: the building object, and its
// furniture and yard as its children, so they move, turn, copy and delete with it. Call inside
// an edit.

import { Vec3, type Generated, type MapSession } from '@pixel-arena/core'

/** Creates the building at `at` turned by `yaw`; returns its id. */
export function placeGenerated(s: MapSession, g: Generated, at: Vec3, yaw = 0): string {
  const id = s.createObject('building', { position: at, rotation: yaw, ...g.props })
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  for (const c of g.children) {
    // Building-local to world, the same turn as the building's (three.js rotation about y).
    const x = at.x + c.x * cos + c.z * sin
    const z = at.z - c.x * sin + c.z * cos
    s.createObject('prop', { prop: c.prop, position: new Vec3(x, at.y + c.y, z), rotation: yaw + c.rotation, parent: id, ...(c.scale ? { scale: c.scale } : {}) })
  }
  return id
}
