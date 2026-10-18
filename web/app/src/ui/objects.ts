// What the outliner (Select mode) and the water list show: map objects arranged into sections
// (by object type, by prop category, or one list), user groups as expandable nodes, things that
// sit on others indented under them, ordered by name, the map's custom order or when they were
// added, filtered by a search. Names come from editor/labels.ts, shared with the edit history.

import { SETTINGS_ID, Vec3, type MapDocument, type MapObject } from '@pixel-arena/core'
import type { Library } from '../library/library'
import { GROUP, isLocked } from '../editor/grouping'
import { objectName } from '../editor/labels'
import type { OutlineGroupBy, OutlineSort } from './ui-state.svelte'

export function objectPosition(obj: MapObject): Vec3 {
  const p = obj.props.get('position')
  return p instanceof Vec3 ? p : Vec3.ZERO
}

export interface OutlineRow {
  id: string
  name: string
  type: string
  depth: number
  /** A user group (its id is also its collapse key). */
  isGroup: boolean
  /** Locked itself; lockedBy: locked through a group. */
  locked: boolean
  lockedBy: boolean
  /** The user group this row sits in directly (null: none). */
  group: string | null
  /** Rows inside (groups and objects with things on them). */
  count: number
}

export interface OutlineSection {
  key: string
  label: string
  rows: OutlineRow[]
}

const TYPE_SECTIONS: [string, string][] = [['group', 'Groups'], ['building', 'Buildings'], ['water', 'Water'], ['prop', 'Props']]

export interface OutlineOptions {
  query: string
  groupBy: OutlineGroupBy
  sort: OutlineSort
  /** Group ids whose contents are hidden. */
  collapsed: Set<string>
}

/** Comparator for an outliner sort (creation order from the document's object order). */
export function outlineCompare(doc: MapDocument, library: Library, sort: OutlineSort): (a: MapObject, b: MapObject) => number {
  const index = new Map([...doc.objects.keys()].map((id, i) => [id, i]))
  const name = (x: MapObject) => objectName(x, library)
  const order = (x: MapObject) => {
    const v = x.props.get('order')
    return typeof v === 'number' ? v : Number.MAX_SAFE_INTEGER
  }
  const byIndex = (a: MapObject, b: MapObject) => index.get(a.id)! - index.get(b.id)!
  return {
    name: (a: MapObject, b: MapObject) => name(a).localeCompare(name(b)),
    custom: (a: MapObject, b: MapObject) => order(a) - order(b) || byIndex(a, b),
    newest: (a: MapObject, b: MapObject) => byIndex(b, a),
    oldest: byIndex,
  }[sort]
}

export function outline(doc: MapDocument, library: Library, o: OutlineOptions): OutlineSection[] {
  const all = [...doc.objects.values()].filter((x) => !x.deleted && x.id !== SETTINGS_ID)
  const ids = new Set(all.map((x) => x.id))
  const isGroup = (x: MapObject) => x.type === GROUP
  const groupOf = (x: MapObject) => {
    const g = x.props.get('group')
    return typeof g === 'string' && ids.has(g) && isGroup(doc.getObject(g)!) ? g : null
  }
  const parentOf = (x: MapObject) => {
    const p = x.props.get('parent')
    return !isGroup(x) && typeof p === 'string' && ids.has(p) ? p : null
  }
  // Containment: a group's members, and things sitting on an object.
  const kids = new Map<string, MapObject[]>()
  const tops: MapObject[] = []
  for (const x of all) {
    const holder = parentOf(x) ?? groupOf(x)
    if (holder) (kids.get(holder) ?? kids.set(holder, []).get(holder)!).push(x)
    else tops.push(x)
  }
  const sorted = (list: MapObject[]) => [...list].sort(outlineCompare(doc, library, o.sort))

  const q = o.query.trim().toLowerCase()
  const rows = (x: MapObject, depth: number): OutlineRow[] => {
    const inner = sorted(kids.get(x.id) ?? []).flatMap((c) => rows(c, depth + 1))
    const own = objectName(x, library)
    if (q && !own.toLowerCase().includes(q) && inner.length === 0) return []
    const locked = x.props.get('locked') === true
    const row: OutlineRow = {
      id: x.id, name: own, type: x.type, depth, isGroup: isGroup(x), locked, lockedBy: !locked && isLocked(doc, x.id),
      group: groupOf(x), count: inner.length,
    }
    // A search shows matches inside collapsed groups too.
    return [row, ...(o.collapsed.has(x.id) && !q ? [] : inner)]
  }

  const sectionOf = (x: MapObject): [string, string] => {
    if (o.groupBy === 'none') return ['all', '']
    if (o.groupBy === 'category' && x.type === 'prop') {
      const cat = (library.props.get(String(x.props.get('prop')))?.category ?? 'other').split('/')[0]
      return [`cat:${cat}`, cat.charAt(0).toUpperCase() + cat.slice(1)]
    }
    return TYPE_SECTIONS.find(([k]) => k === x.type) ?? ['other', 'Other']
  }
  const sections = new Map<string, OutlineSection>()
  for (const x of sorted(tops)) {
    const [key, label] = sectionOf(x)
    if (!sections.has(key)) sections.set(key, { key, label, rows: [] })
    sections.get(key)!.rows.push(...rows(x, 0))
  }
  // Groups first, then the type sections in their usual order, then categories alphabetically.
  const rank = (k: string) => {
    const i = TYPE_SECTIONS.findIndex(([t]) => t === k)
    return i >= 0 ? i : TYPE_SECTIONS.length
  }
  return [...sections.values()].filter((s) => s.rows.length).sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label))
}

/** Ids at one level: in `group` (null: top level), not sitting on anything, in the order the
 *  outliner shows them with `sort` (the custom order by default). */
export function siblings(doc: MapDocument, library: Library, group: string | null, sort: OutlineSort = 'custom'): string[] {
  return [...doc.objects.values()]
    .filter((x) => !x.deleted && x.id !== SETTINGS_ID && (x.props.get('group') ?? null) === group && !(x.type !== GROUP && typeof x.props.get('parent') === 'string'))
    .sort(outlineCompare(doc, library, sort))
    .map((x) => x.id)
}
