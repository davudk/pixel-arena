// Puts a generated building (core building-gen) on the map: the building object, and its
// furniture and yard as its children, so they move, turn, copy and delete with it. Call inside
// an edit. Children get ids derived from the building's (<id>.<n>): a building brings about a
// hundred of them, and random uuids for each would double the size of the saved file.

import { Vec3, type Furnishing, type MapSession, type Value } from '@pixel-arena/core'

/** Creates the building at `at` turned by `yaw`; returns its id. */
export function placeGenerated(s: MapSession, g: { props: Record<string, Value>; children: Furnishing[] }, at: Vec3, yaw = 0): string {
  const id = s.createObject('building', { position: at, rotation: yaw, ...g.props })
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  g.children.forEach((c, n) => {
    // Building-local to world, the same turn as the building's (three.js rotation about y).
    const x = at.x + c.x * cos + c.z * sin
    const z = at.z - c.x * sin + c.z * cos
    s.createObject('prop', { prop: c.prop, position: new Vec3(x, at.y + c.y, z), rotation: yaw + c.rotation, parent: id, ...(c.scale ? { scale: c.scale } : {}) }, `${id}.${n + 1}`)
  })
  return id
}
