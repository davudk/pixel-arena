// Interface preferences for this player: panel widths and visibility, open sections, how the
// prop panel lists things, favourites and recently placed props, tool parameters and saved
// tools. Saved in localStorage (not in the map). Self-test runs start from the defaults and
// don't save.

import type { ParamTool } from '../editor/tool-params'
import type { Mode } from '../editor/tools'

export type ViewMode = 'cards' | 'list'
export type GroupBy = 'none' | 'category' | 'subcategory' | 'pack'
export type SortBy = 'name' | 'size' | 'height' | 'recent' | 'used'
export type CardSize = 's' | 'm' | 'l'
export type OutlineGroupBy = 'type' | 'category' | 'none'
export type OutlineSort = 'name' | 'custom' | 'newest' | 'oldest'
export type { Mode }
/** A registry tool saved with the parameters it keeps, optionally on a number key (1-9).
 *  See saved-tools.ts. */
export interface SavedTool {
  id: string
  slot: number | null
  name: string // empty: described from its parameters
  tool: ParamTool
  params: Record<string, unknown>
}

const DEFAULTS = {
  mode: 'props' as Mode,
  leftWidth: 300,
  rightWidth: 280,
  leftHidden: false,
  /** The tools container left of the map (hidden with Tab). */
  toolsHidden: false,
  rightHidden: false,
  sections: { view: true, history: true, selection: true } as Record<string, boolean>,
  theme: '',
  hiddenCategories: [] as string[],
  viewMode: 'cards' as ViewMode,
  cardSize: 'm' as CardSize,
  groupBy: 'category' as GroupBy,
  sortBy: 'name' as SortBy,
  favourites: [] as string[],
  recent: [] as string[],
  /** Collapsed prop groups (group keys); recently placed starts collapsed. */
  collapsedGroups: [':recent'] as string[],
  /** Select mode's outliner: sections (by object type, by prop category, or none) and order
   *  (by name, the map's custom order, or when objects were added). */
  outliner: { groupBy: 'type' as OutlineGroupBy, sort: 'name' as OutlineSort },
  showStats: false,
  tools: [] as SavedTool[],
  /** Tool parameters (tool-params.ts), restored at start. */
  toolParams: null as unknown,
  /** The terrain tool last in hand, picked up again when Terrain mode opens. */
  terrainTool: 'sculpt' as 'sculpt' | 'paint',
  /** The water tool last in hand (Draw or Erase). */
  waterTool: 'water' as 'water' | 'waterErase',
  /** The building piece last built with (Build's "Build" switch goes back to it after Erase). */
  buildPiece: 'wall' as 'foundation' | 'wall' | 'door' | 'window' | 'doorway' | 'stairs',
}
export type UiPrefs = typeof DEFAULTS

const KEY = 'pixel-arena:ui'
const persist = !new URLSearchParams(location.search).has('selftest')

function load(): UiPrefs {
  const base = structuredClone(DEFAULTS)
  if (!persist) return base
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // Earlier builds saved only terrain brushes, as `brushes`.
    if (Array.isArray(saved.brushes) && !saved.tools) {
      saved.tools = saved.brushes.map((b: Record<string, unknown>, i: number): SavedTool => ({
        id: `migrated-${i}`, slot: (b.slot as number) ?? null, name: String(b.name ?? ''),
        ...(b.mode === 'paint'
          ? { tool: 'paint', params: { material: b.material, radius: b.radius } }
          : { tool: 'sculpt', params: { op: b.mode, radius: b.radius, strength: b.strength } }),
      }))
    }
    delete saved.brushes
    // The water brush became the brush shape of Draw.
    if (Array.isArray(saved.tools)) {
      saved.tools = saved.tools.map((t: SavedTool | (Omit<SavedTool, 'tool'> & { tool: 'waterBrush' })) =>
        t.tool === 'waterBrush' ? { ...t, tool: 'water', params: { ...t.params, shape: 'brush' } } : t)
    }
    delete saved.randomRotation
    delete saved.snap
    return { ...base, ...saved, sections: { ...base.sections, ...(saved.sections ?? {}) }, outliner: { ...base.outliner, ...(saved.outliner ?? {}) } }
  } catch {
    return base
  }
}

export const ui: UiPrefs = $state(load())

/** Call once from a component: saves whenever a preference changes. */
export function persistUi() {
  $effect(() => {
    const json = JSON.stringify(ui)
    if (!persist) return
    try {
      localStorage.setItem(KEY, json)
    } catch {
      // storage unavailable: preferences last for this session
    }
  })
}

export const RECENT_MAX = 6

export function noteRecent(id: string) {
  ui.recent = [id, ...ui.recent.filter((r) => r !== id)].slice(0, RECENT_MAX)
}

export function toggleFavourite(id: string) {
  ui.favourites = ui.favourites.includes(id) ? ui.favourites.filter((f) => f !== id) : [...ui.favourites, id]
}

/** Prop thumbnails (object URLs) as they finish rendering; any component can read them. */
export const thumbUrls: Record<string, string> = $state({})
