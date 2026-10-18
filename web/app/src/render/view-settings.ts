// How the map looks to this viewer (port of ViewSettings): filter preset and options, time of
// day, grid. Not map content. Each value resolves through layers, most specific first:
//   player override (this browser, localStorage) -> map default (MapDocument @settings
//   "view/<key>") -> preset (for filter options) -> built-in default.
// Filter options come from the same layer as the filter choice: if the player picked a preset,
// the map's option defaults don't leak into it. A server default layer slots in for co-op later.

import { ops, SETTINGS_ID, Signal, type MapDocument, type Op, type Value } from '@pixel-arena/core'
import { isOption, OPTIONS, presetValue, type FilterOptions, type OptionKey } from './filters'

export const BASE = {
  filter: 'pixel',
  time_mode: 'fixed', // fixed | cycle
  time_of_day: 10,
  day_length: 600, // seconds per in-game day in cycle mode
  grid: true,
}
export type BaseKey = keyof typeof BASE
export type ViewKey = BaseKey | OptionKey
const PREFIX = 'view/'
const STORAGE_KEY = 'pixel-arena:view'

export class ViewSettings {
  readonly changed = new Signal<void>()
  overrides: Partial<Record<ViewKey, Value>> = {}
  private doc: MapDocument | null = null
  private unbind: (() => void)[] = []

  constructor(private persist = true) {
    if (persist) {
      try {
        this.overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      } catch {
        this.overrides = {}
      }
    }
  }

  bind(doc: MapDocument) {
    this.unbind.forEach((f) => f())
    this.doc = doc
    this.unbind = [
      doc.changed.connect((op) => {
        if (op.op !== 'terrain' && op.id === SETTINGS_ID) this.changed.emit()
      }),
      doc.reset.connect(() => this.changed.emit()),
    ]
    this.changed.emit()
  }

  get<K extends ViewKey>(key: K): K extends OptionKey ? FilterOptions[K] : (typeof BASE)[K & BaseKey] {
    return this.resolve(key) as never
  }

  /** All filter options, resolved. */
  filterOptions(): FilterOptions {
    const out = {} as Record<OptionKey, unknown>
    for (const k of Object.keys(OPTIONS) as OptionKey[]) out[k] = this.resolve(k)
    return out as FilterOptions
  }

  mapDefault(key: ViewKey): Value {
    return this.doc?.getSetting(PREFIX + key) ?? null
  }

  setOverride(key: ViewKey, value: Value) {
    this.overrides[key] = value
    this.save()
  }

  /** Picks a preset; its options replace any per-option overrides. */
  chooseFilter(name: string) {
    for (const k of Object.keys(OPTIONS)) delete this.overrides[k as OptionKey]
    this.overrides.filter = name
    this.save()
  }

  /** Back to the map's value for one setting. */
  clearOverride(key: ViewKey) {
    delete this.overrides[key]
    this.save()
  }

  clearOverrides() {
    this.overrides = {}
    this.save()
  }

  /** Ops that make the currently resolved values the map's defaults (apply in a transaction). */
  mapDefaultOps(): Op[] {
    const out: Op[] = []
    for (const key of [...Object.keys(BASE), ...Object.keys(OPTIONS)] as ViewKey[]) {
      const value = this.resolve(key) as Value
      if (this.mapDefault(key) !== value) out.push(ops.setProp(SETTINGS_ID, PREFIX + key, value))
    }
    return out
  }

  private resolve(key: ViewKey): unknown {
    if (key in this.overrides) return this.overrides[key]
    if (isOption(key)) {
      if ('filter' in this.overrides) return presetValue(String(this.overrides.filter), key)
      const map = this.mapDefault(key)
      if (map !== null) return map
      return presetValue(String(this.mapDefault('filter') ?? BASE.filter), key)
    }
    const map = this.mapDefault(key)
    return map !== null ? map : BASE[key as BaseKey]
  }

  private save() {
    if (this.persist) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides))
      } catch {
        // storage unavailable (private window): overrides last for this session only
      }
    }
    this.changed.emit()
  }
}
