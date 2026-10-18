// One SIZE x SIZE meter square of terrain. Heights are sampled on the 1 m grid corners
// (SAMPLES per side, so samples on a border are duplicated in the neighbouring chunk);
// materials are one palette index per 1 m cell. All-default chunks are not stored.

import { Rect2i, Vec2i, type Value } from './values'

export const SIZE = 32
export const SAMPLES = SIZE + 1
export const HEIGHT = 'height'
export const MATERIAL = 'material'
export type Layer = typeof HEIGHT | typeof MATERIAL
export type LayerValues = Float32Array | Uint8Array

export class TerrainChunk {
  heights = new Float32Array(SAMPLES * SAMPLES)
  materials = new Uint8Array(SIZE * SIZE)
  /** Height range of this chunk, kept current by write(). */
  minHeight = 0
  maxHeight = 0

  constructor(readonly coord: Vec2i = Vec2i.ZERO) {}

  /** Grid width of a layer. */
  static side(layer: Layer): number {
    return layer === HEIGHT ? SAMPLES : SIZE
  }

  static defaultValues(layer: Layer, count: number): LayerValues {
    return layer === HEIGHT ? new Float32Array(count) : new Uint8Array(count)
  }

  static isValidRect(layer: string, rect: Rect2i): boolean {
    if (layer !== HEIGHT && layer !== MATERIAL) return false
    const n = TerrainChunk.side(layer)
    return rect.w > 0 && rect.h > 0 && new Rect2i(0, 0, n, n).encloses(rect)
  }

  /** Values inside `rect`, row-major. */
  read(layer: Layer, rect: Rect2i): LayerValues {
    const out = TerrainChunk.defaultValues(layer, rect.area)
    const src = layer === HEIGHT ? this.heights : this.materials
    const n = TerrainChunk.side(layer)
    let i = 0
    for (let z = rect.y; z < rect.endY; z++) for (let x = rect.x; x < rect.endX; x++) out[i++] = src[z * n + x]
    return out
  }

  /** Writes row-major `values` into `rect`; returns the values that were there before. */
  write(layer: Layer, rect: Rect2i, values: ArrayLike<number>): LayerValues {
    const prev = this.read(layer, rect)
    const dst = layer === HEIGHT ? this.heights : this.materials
    const n = TerrainChunk.side(layer)
    let i = 0
    for (let z = rect.y; z < rect.endY; z++) for (let x = rect.x; x < rect.endX; x++) dst[z * n + x] = values[i++]
    if (layer === HEIGHT) this.updateRange()
    return prev
  }

  updateRange(): void {
    let lo = Infinity
    let hi = -Infinity
    for (const h of this.heights) {
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
    this.minHeight = lo
    this.maxHeight = hi
  }

  isDefault(): boolean {
    return this.heights.every((h) => h === 0) && this.materials.every((m) => m === 0)
  }

  toDict(): Record<string, Value> {
    return { coord: this.coord, heights: this.heights, materials: this.materials }
  }

  static fromDict(d: Record<string, Value>): TerrainChunk {
    const chunk = new TerrainChunk(d.coord as Vec2i)
    chunk.heights = new Float32Array(d.heights as Float32Array)
    chunk.materials = new Uint8Array(d.materials as Uint8Array)
    chunk.updateRange()
    return chunk
  }
}
