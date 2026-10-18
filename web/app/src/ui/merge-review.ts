// Rows for the merge review (port of MergeDialog's logic): one row per conflict, with terrain
// conflicts grouped per layer since a sculpt touches hundreds of cells. Each row knows the
// conflict keys it covers, so a Keep / Take choice maps straight to resolutions.

import { BuildingLayout, merge, PackedVec2Array, SETTINGS_ID, Vec3, type MapDocument, type MapSession } from '@pixel-arena/core'
import type { Library } from '../library/library'

export interface ReviewRow {
  what: string
  mine: string
  theirs: string
  keys: string[]
}

export interface Review {
  source: string
  target: string
  changes: number
  conflicts: number
  rows: ReviewRow[]
}

export function buildReview(session: MapSession, branchId: string, library: Library): Review {
  const src = session.branches.get(branchId)!
  const dst = session.branches.get(src.parentId)!
  const plan = session.mergePlan(branchId)
  const rows: ReviewRow[] = []
  const terrain = new Map<string, string[]>()
  for (const c of plan.conflicts) {
    if (c.kind === 'terrain') {
      if (!terrain.has(c.layer)) terrain.set(c.layer, [])
      terrain.get(c.layer)!.push(c.key)
      continue
    }
    rows.push({ what: describe(session.doc, c, library), mine: format(c.mine), theirs: format(c.theirs), keys: [c.key] })
  }
  for (const [layer, keys] of terrain) rows.push({ what: `Terrain ${layer} (${keys.length} cells)`, mine: 'edited', theirs: 'edited', keys })
  return { source: src.name, target: dst.name, changes: plan.changes.length, conflicts: plan.conflicts.length, rows }
}

/** Conflict key -> resolution, from one choice per row (true = take the merged branch's value). */
export function resolutions(rows: ReviewRow[], take: boolean[]): Record<string, merge.Resolution> {
  const out: Record<string, merge.Resolution> = {}
  rows.forEach((row, i) => row.keys.forEach((k) => (out[k] = take[i] ? merge.THEIRS : merge.MINE)))
  return out
}

function describe(doc: MapDocument, c: merge.Conflict, library: Library): string {
  if (c.kind === 'terrain') return `Terrain ${c.layer}`
  const obj = doc.getObject(c.id)
  let what = `Object ${c.id.slice(0, 8)}`
  if (c.id === SETTINGS_ID) what = 'Map settings'
  else if (obj?.type === 'building') what = `Building${obj ? ` (${BuildingLayout.fromObject(obj).levelIndices().length} levels)` : ''}`
  else if (obj?.type === 'water') what = 'Water'
  else if (obj) what = library.props.get(String(obj.props.get('prop')))?.name ?? String(obj.props.get('prop') ?? 'Prop')
  // Tell same-named objects apart by where they are.
  const at = obj?.props.get('position')
  if (at instanceof Vec3 && obj?.type !== 'settings') what += ` at ${Math.round(at.x)}, ${Math.round(at.z)}`
  return c.kind === 'object' ? `${what} (exists / deleted)` : `${what} · ${c.path}`
}

export function format(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (v instanceof Vec3) return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (v instanceof PackedVec2Array) return `${v.points.length} points`
  if (typeof v === 'object' && 'deleted' in (v as object)) return (v as { deleted: boolean }).deleted ? 'deleted' : 'exists'
  return String(v)
}
