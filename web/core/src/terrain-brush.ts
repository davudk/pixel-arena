// Brush math for terrain tools: one brush application at a world position becomes terrain ops.
// Heights are sample-based (1 m grid); weights fall off smoothly to the brush edge.

import type { MapDocument } from './map-document'
import type { TerrainOp } from './ops'
import { heightAt, heightOps, materialOps } from './terrain-edit'
import { Rect2i, type Vec3 } from './values'

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'

/** Smoothstep falloff: 1 at the center, 0 at `radius`. */
export function weight(distance: number, radius: number): number {
  const t = Math.min(Math.max(1 - distance / Math.max(radius, 0.001), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Height ops for one application. `amount`: meters at the center for raise/lower, blend
 *  factor (0-1) for smooth/flatten. `target` is the flatten height. */
export function sculptOps(doc: MapDocument, mode: BrushMode, center: Vec3, radius: number, amount: number, target = 0): TerrainOp[] {
  const size = Math.ceil(radius * 2) + 2
  const rect = new Rect2i(Math.floor(center.x - radius), Math.floor(center.z - radius), size, size)
  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
  return heightOps(doc, rect, (sx, sz, old) => {
    const w = weight(Math.hypot(sx - center.x, sz - center.z), radius)
    if (w <= 0) return old
    switch (mode) {
      case 'raise': return old + amount * w
      case 'lower': return old - amount * w
      case 'flatten': return old + (target - old) * clamp01(amount * w)
      case 'smooth': {
        let sum = 0
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sum += heightAt(doc, sx + dx, sz + dz)
        return old + (sum / 9 - old) * clamp01(amount * w)
      }
    }
  })
}

/** Material ops painting every cell whose center lies within `radius`. */
export function paintOps(doc: MapDocument, center: Vec3, radius: number, material: number): TerrainOp[] {
  const size = Math.ceil(radius * 2) + 3
  const rect = new Rect2i(Math.floor(center.x - radius) - 1, Math.floor(center.z - radius) - 1, size, size)
  return materialOps(doc, rect, (cx, cz, old) => (Math.hypot(cx + 0.5 - center.x, cz + 0.5 - center.z) <= radius ? material : old))
}
