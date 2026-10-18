// Placement snapping. Snapping is editor behaviour only: positions are always stored as floats.
//   grid    - align the footprint to cells of `step` meters. A footprint spanning an odd number
//             of cells sits in a cell's center; an even number sits on a grid line.
//   subgrid - round to multiples of `step`.
//   free    - no snapping.

import { Vec3, type Vec2 } from './values'

export type SnapMode = 'grid' | 'subgrid' | 'free'

export function gridAxis(v: number, step: number, size: number): number {
  if (step <= 0) return v
  const cells = Math.max(1, Math.round(size / step))
  return cells % 2 === 1 ? Math.floor(v / step) * step + step * 0.5 : Math.round(v / step) * step
}

export function snapPosition(p: Vec3, mode: SnapMode, step: number, footprint: Vec2): Vec3 {
  switch (mode) {
    case 'grid':
      return new Vec3(gridAxis(p.x, step, footprint.x), p.y, gridAxis(p.z, step, footprint.y))
    case 'subgrid':
      return step <= 0 ? p : new Vec3(Math.round(p.x / step) * step, p.y, Math.round(p.z / step) * step)
  }
  return p
}

export function snapYaw(yaw: number, degrees: number): number {
  if (degrees <= 0) return yaw
  const step = (degrees * Math.PI) / 180
  return Math.round(yaw / step) * step
}

/** Footprint after rotating by `yaw` (only 90 degree turns swap axes). */
export function footprintAt<T extends { x: number; y: number }>(footprint: T, yaw: number, make: (x: number, y: number) => T): T {
  const quarter = (((Math.round(yaw / (Math.PI / 2)) % 2) + 2) % 2)
  return quarter === 1 ? make(footprint.y, footprint.x) : footprint
}
