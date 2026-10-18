// What the prop panel shows: filtering (theme, search, hidden categories), sorting and grouping.
// Pure functions over the library so the panel component stays about layout.

import type { Library, PropDef } from '../library/library'
import type { GroupBy, SortBy } from './ui-state.svelte'

export interface CategoryNode {
  path: string
  name: string
  count: number
  /** Leaf categories (that props use directly) at or below this node. */
  leaves: string[]
  children: CategoryNode[]
}

/** Category tree for the filter popover, from the library's category paths. */
export function categoryTree(library: Library): CategoryNode[] {
  const counts = library.categories()
  const direct = new Set([...library.props.values()].map((p) => p.category))
  const nodes = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []
  for (const [path, count] of counts) {
    const node: CategoryNode = { path, name: path.split('/').pop()!, count, leaves: [], children: [] }
    nodes.set(path, node)
    const parent = path.includes('/') ? nodes.get(path.slice(0, path.lastIndexOf('/'))) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  const fill = (n: CategoryNode): string[] => {
    n.leaves = [...(direct.has(n.path) ? [n.path] : []), ...n.children.flatMap(fill)]
    return n.leaves
  }
  roots.forEach(fill)
  return roots
}

export interface Filters {
  query: string
  theme: string
  hidden: Set<string>
}

export function filterProps(library: Library, f: Filters): PropDef[] {
  return library.search(f.query, f.theme).filter((p) => !f.hidden.has(p.category))
}

export function sortProps(props: PropDef[], by: SortBy, descending: boolean, ctx: { recent: string[]; usage: Map<string, number> }): PropDef[] {
  const name = (a: PropDef, b: PropDef) => a.name.localeCompare(b.name)
  const area = (p: PropDef) => p.footprint[0] * p.footprint[1]
  const rank = (p: PropDef) => {
    const i = ctx.recent.indexOf(p.id)
    return i < 0 ? Infinity : i
  }
  const key: Record<SortBy, (a: PropDef, b: PropDef) => number> = {
    name,
    size: (a, b) => area(a) - area(b),
    height: (a, b) => a.height - b.height,
    // Most recent / most used first by default.
    recent: (a, b) => rank(a) - rank(b),
    used: (a, b) => (ctx.usage.get(b.id) ?? 0) - (ctx.usage.get(a.id) ?? 0),
  }
  const dir = descending ? -1 : 1
  return [...props].sort((a, b) => dir * key[by](a, b) || name(a, b))
}

export interface Group {
  key: string
  label: string
  detail: string
  props: PropDef[]
}

export function groupProps(props: PropDef[], by: GroupBy, library: Library): Group[] {
  if (by === 'none') return [{ key: 'all', label: '', detail: '', props }]
  const groups = new Map<string, Group>()
  for (const p of props) {
    const parts = p.category.split('/')
    const key = by === 'pack' ? p.packId : by === 'category' ? parts[0] : p.category
    const label = by === 'pack' ? (library.packs.get(p.packId)?.name ?? p.packId) : by === 'category' ? parts[0] : parts.at(-1)!
    const detail = by === 'subcategory' && parts.length > 1 ? parts.slice(0, -1).join(' › ') : ''
    if (!groups.has(key)) groups.set(key, { key, label, detail, props: [] })
    groups.get(key)!.props.push(p)
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Props used on the map, by prop id. */
export function usageCounts(objects: Iterable<{ deleted: boolean; type: string; props: Map<string, unknown> }>): Map<string, number> {
  const out = new Map<string, number>()
  for (const o of objects) {
    if (o.deleted || o.type !== 'prop') continue
    const id = String(o.props.get('prop'))
    out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}

/** Up to four props that represent a theme: the first of its four largest categories. */
export function themeCover(library: Library, theme: string): PropDef[] {
  const byCat = new Map<string, PropDef[]>()
  for (const p of library.props.values()) {
    if (theme && !p.themes.includes(theme)) continue
    const top = p.category
    if (!byCat.has(top)) byCat.set(top, [])
    byCat.get(top)!.push(p)
  }
  const cats = [...byCat.values()].sort((a, b) => b.length - a.length)
  const out = cats.slice(0, 4).map((list) => list.sort((a, b) => b.height - a.height)[Math.floor(list.length / 3)])
  // Fewer than four categories: fill from the biggest one.
  for (const p of cats[0] ?? []) if (out.length < 4 && !out.includes(p)) out.push(p)
  return out
}

export function propTooltip(p: PropDef, library: Library): string {
  const pack = library.packs.get(p.packId)?.name ?? p.packId
  return `${p.name}\n${p.category.replace(/\//g, ' › ')}${p.themes.length ? ` · ${p.themes.join(', ')}` : ''}\n` +
    `${p.footprint[0]} × ${p.footprint[1]} m, ${p.height} m tall\n${pack} · ${p.attribution.author ?? ''} (${p.attribution.license})`
}
