// Groups, locks, names and manual order: map data, so they are shared, undoable and merge like
// any other edit.
//   group   an object of type 'group' (props: name). Members point to it with the 'group'
//           property; groups can be members of groups.
//   locked  true on an object or group: it can't be picked, box-selected, moved or deleted.
//           Locking a group locks everything in it.
//   name    an optional custom name for any object (see labels.ts).
//   order   a number for the outliner's custom order (lower first).

import type { MapDocument, MapSession } from '@pixel-arena/core'
import type { Library } from '../library/library'
import { objectsLabel, objectName } from './labels'

export const GROUP = 'group'

const live = (doc: MapDocument, id: string) => {
  const o = doc.getObject(id)
  return o && !o.deleted ? o : null
}

/** The group an object belongs to directly, if any (and it still exists). */
export function parentGroup(doc: MapDocument, id: string): string | null {
  const g = live(doc, id)?.props.get('group')
  return typeof g === 'string' && live(doc, g)?.type === GROUP ? g : null
}

/** The outermost group containing `id` (or null). */
export function topGroup(doc: MapDocument, id: string): string | null {
  let g = parentGroup(doc, id)
  for (let guard = 0; g && guard < 64; guard++) {
    const up = parentGroup(doc, g)
    if (!up) return g
    g = up
  }
  return g
}

/** Direct members of a group (objects and groups). */
export function children(doc: MapDocument, groupId: string): string[] {
  const out: string[] = []
  for (const o of doc.objects.values()) if (!o.deleted && o.props.get('group') === groupId) out.push(o.id)
  return out
}

/** Every non-group object inside a group, at any depth. */
export function members(doc: MapDocument, groupId: string): string[] {
  const out: string[] = []
  const walk = (g: string, depth: number) => {
    if (depth > 64) return
    for (const id of children(doc, g)) {
      if (live(doc, id)?.type === GROUP) walk(id, depth + 1)
      else out.push(id)
    }
  }
  walk(groupId, 0)
  return out
}

/** Locked itself, or inside a locked group. */
export function isLocked(doc: MapDocument, id: string): boolean {
  let cur: string | null = id
  for (let guard = 0; cur && guard < 64; guard++) {
    if (live(doc, cur)?.props.get('locked') === true) return true
    cur = parentGroup(doc, cur)
  }
  return false
}

/** What clicking `id` on the map selects: its outermost group's members, else itself. */
export function pickTargets(doc: MapDocument, id: string): string[] {
  const g = topGroup(doc, id)
  return g ? members(doc, g) : [id]
}

/** `ids` without locked objects. */
export function editable(doc: MapDocument, ids: string[]): string[] {
  return ids.filter((id) => !isLocked(doc, id))
}

/** The selection as top-level items: each selected object, or its outermost group when that
 *  whole group is selected (what grouping and locking apply to). */
export function topItems(doc: MapDocument, ids: string[]): string[] {
  const chosen = new Set(ids)
  const items = new Set<string>()
  for (const id of ids) {
    let item = id
    // Climb while the whole enclosing group is selected.
    for (let g = parentGroup(doc, item); g && members(doc, g).every((m) => chosen.has(m)); g = parentGroup(doc, g)) item = g
    items.add(item)
  }
  return [...items]
}

/** Puts the selection into a new group (inside the group they all share, if any). Returns the
 *  group's id, or null for fewer than two items. */
export function groupSelection(session: MapSession, ids: string[], library: Library): string | null {
  const doc = session.doc
  const items = topItems(doc, ids)
  if (items.length < 2) return null
  const shared = items.map((i) => parentGroup(doc, i))
  const parent = shared.every((g) => g === shared[0]) ? shared[0] : null
  const count = [...doc.objects.values()].filter((o) => !o.deleted && o.type === GROUP).length
  let id = ''
  session.edit(objectsLabel('Group', items, doc, library), () => {
    id = session.createObject(GROUP, { name: `Group ${count + 1}`, ...(parent ? { group: parent } : {}) })
    for (const item of items) session.setProp(item, 'group', id)
  })
  return id
}

/** Dissolves a group: its members move to the group's own parent. */
export function ungroup(session: MapSession, groupId: string, library: Library) {
  const doc = session.doc
  const obj = live(doc, groupId)
  if (obj?.type !== GROUP) return
  const parent = parentGroup(doc, groupId)
  session.edit(`Ungroup ${objectName(obj, library)}`, () => {
    for (const id of children(doc, groupId)) session.setProp(id, 'group', parent)
    session.deleteObject(groupId)
  })
}

/** The outermost groups the selection fully covers (what "Ungroup" applies to). */
export function selectedGroups(doc: MapDocument, ids: string[]): string[] {
  const chosen = new Set(ids)
  const out = new Set<string>()
  for (const id of ids) {
    const g = topGroup(doc, id)
    if (g && members(doc, g).every((m) => chosen.has(m))) out.add(g)
  }
  return [...out]
}

export function setLocked(session: MapSession, ids: string[], locked: boolean, library: Library) {
  if (!ids.length) return
  session.edit(objectsLabel(locked ? 'Lock' : 'Unlock', ids, session.doc, library), () => {
    for (const id of ids) session.setProp(id, 'locked', locked ? true : null)
  })
}

export function rename(session: MapSession, id: string, name: string, library: Library) {
  const obj = live(session.doc, id)
  if (!obj) return
  const before = objectName(obj, library)
  const value = name.trim() || null
  if ((obj.props.get('name') ?? null) === value) return
  session.edit(`Rename ${before}${value ? ` to ${value}` : ''}`, () => session.setProp(id, 'name', value))
}

/** Puts `ids` in this order (numbering them), and into `group` (null: no group), as one edit. */
export function reorder(session: MapSession, ids: string[], group: string | null | undefined, label: string) {
  session.edit(label, () => {
    ids.forEach((id, i) => {
      if (session.doc.getProp(id, 'order') !== i) session.setProp(id, 'order', i)
      if (group !== undefined && (session.doc.getProp(id, 'group') ?? null) !== group) session.setProp(id, 'group', group)
    })
  })
}

/** Deletes groups left with no members (after deleting objects), inside the current edit. */
export function pruneEmptyGroups(session: MapSession) {
  const doc = session.doc
  for (let pass = 0; pass < 8; pass++) {
    const empty = [...doc.objects.values()].filter((o) => !o.deleted && o.type === GROUP && children(doc, o.id).length === 0)
    if (!empty.length) return
    for (const g of empty) session.deleteObject(g.id)
  }
}
