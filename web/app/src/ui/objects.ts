// Display names and grouping for map objects (outliner, water list, selection panel).

import { SETTINGS_ID, Vec3, type MapDocument, type MapObject } from '@pixel-arena/core'
import type { Library } from '../library/library'

export function objectName(obj: MapObject, library: Library): string {
  if (obj.type === 'prop') {
    const id = String(obj.props.get('prop'))
    return library.props.get(id)?.name ?? id
  }
  if (obj.type === 'building') return library.kits.get(String(obj.props.get('kit')))?.name ?? 'Building'
  if (obj.type === 'water') return 'Water'
  return obj.type
}

export function objectPosition(obj: MapObject): Vec3 {
  const p = obj.props.get('position')
  return p instanceof Vec3 ? p : Vec3.ZERO
}

export interface OutlineRow {
  id: string
  name: string
  depth: number
}

export interface OutlineGroup {
  key: string
  label: string
  rows: OutlineRow[]
}

const GROUPS: [string, string][] = [['building', 'Buildings'], ['water', 'Water'], ['prop', 'Props']]

/** Live objects grouped by type, children (things sitting on others) indented under their
 *  parent, names filtered by `query`. A matching child keeps its parent visible. */
export function outline(doc: MapDocument, library: Library, query: string): OutlineGroup[] {
  const live = [...doc.objects.values()].filter((o) => !o.deleted && o.id !== SETTINGS_ID)
  const children = new Map<string, MapObject[]>()
  const roots: MapObject[] = []
  const ids = new Set(live.map((o) => o.id))
  for (const o of live) {
    const parent = o.props.get('parent')
    if (typeof parent === 'string' && ids.has(parent)) {
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent)!.push(o)
    } else roots.push(o)
  }
  const q = query.trim().toLowerCase()
  const byName = (a: MapObject, b: MapObject) => objectName(a, library).localeCompare(objectName(b, library))
  const rows = (o: MapObject, depth: number): OutlineRow[] => {
    const below = (children.get(o.id) ?? []).sort(byName).flatMap((c) => rows(c, depth + 1))
    const name = objectName(o, library)
    if (q && !name.toLowerCase().includes(q) && below.length === 0) return []
    return [{ id: o.id, name, depth }, ...below]
  }
  return GROUPS.map(([type, label]) => ({
    key: type,
    label,
    rows: roots.filter((o) => (GROUPS.some(([t]) => t === o.type) ? o.type === type : type === 'prop')).sort(byName).flatMap((o) => rows(o, 0)),
  })).filter((g) => g.rows.length > 0)
}
