// Interface preferences for this player: panel widths and visibility, open sections, how the
// prop panel lists things, favourites and recently placed props. Saved in localStorage (not in
// the map). Self-test runs start from the defaults and don't save.

export type ViewMode = 'cards' | 'list'
export type GroupBy = 'none' | 'category' | 'subcategory' | 'pack'
export type SortBy = 'name' | 'size' | 'height' | 'recent' | 'used'
export type CardSize = 's' | 'm' | 'l'

const DEFAULTS = {
  leftWidth: 300,
  rightWidth: 280,
  leftHidden: false,
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
  showStats: false,
}
export type UiPrefs = typeof DEFAULTS

const KEY = 'pixel-arena:ui'
const persist = !new URLSearchParams(location.search).has('selftest')

function load(): UiPrefs {
  const base = structuredClone(DEFAULTS)
  if (!persist) return base
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...base, ...saved, sections: { ...base.sections, ...(saved.sections ?? {}) } }
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
