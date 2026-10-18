// Every tool's parameters in one typed store (what used to be terrainSettings, buildSettings
// and fields on the place tool). Tools read them live; the UI edits them through setParams,
// which emits paramsChanged with the tool's id. The parameter definitions (labels, ranges,
// which ones a saved tool keeps, when they apply) live in the tool registry, tools.ts.

import { Signal } from '@pixel-arena/core'

export type SculptOp = 'raise' | 'lower' | 'smooth' | 'flatten'
export type BuildPiece = 'foundation' | 'erase' | 'wall' | 'door' | 'window'
export const MAX_LEVEL = 9

export interface ToolParams {
  place: { prop: string; randomRotation: boolean; snap: boolean }
  sculpt: { op: SculptOp; radius: number; strength: number }
  paint: { material: number; radius: number }
  /** Liquid id (world/liquids.ts); dig lowers the ground inside into a basin `depth` deep with a
   *  `shore` wide slope at the edge. */
  water: { liquid: string; dig: boolean; depth: number; shore: number; snap: boolean }
  /** The water brush: same liquid and basin settings as drawing, plus its size. */
  waterBrush: { liquid: string; radius: number; dig: boolean; depth: number; shore: number }
  waterErase: { radius: number }
  build: { kit: string; piece: BuildPiece; level: number }
}
/** Tools that have parameters (everything but select). */
export type ParamTool = keyof ToolParams

export const DEFAULT_PARAMS: ToolParams = {
  place: { prop: '', randomRotation: false, snap: true },
  sculpt: { op: 'raise', radius: 4, strength: 0.5 },
  paint: { material: 1, radius: 4 },
  water: { liquid: 'water', dig: true, depth: 1.5, shore: 3, snap: true },
  waterBrush: { liquid: 'water', radius: 2, dig: true, depth: 1.5, shore: 2 },
  waterErase: { radius: 2 },
  build: { kit: 'kenney_town:timber', piece: 'foundation', level: 0 },
}

export const params: ToolParams = structuredClone(DEFAULT_PARAMS)
export const paramsChanged = new Signal<ParamTool>()

export function setParams<T extends ParamTool>(tool: T, patch: Partial<ToolParams[T]>) {
  Object.assign(params[tool], patch)
  paramsChanged.emit(tool)
}

/** Loads saved parameters (unknown keys and tools are ignored). */
export function restoreParams(saved: unknown) {
  if (!saved || typeof saved !== 'object') return
  for (const tool of Object.keys(DEFAULT_PARAMS) as ParamTool[]) {
    const s = (saved as Record<string, Record<string, unknown>>)[tool]
    if (!s) continue
    for (const key of Object.keys(DEFAULT_PARAMS[tool])) {
      if (typeof s[key] === typeof (DEFAULT_PARAMS[tool] as Record<string, unknown>)[key]) (params[tool] as Record<string, unknown>)[key] = s[key]
    }
  }
}
