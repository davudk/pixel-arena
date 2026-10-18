// Group / ungroup / lock for the current selection, shared by the outliner, the bottom bar and
// the keyboard (Cmd/Ctrl+G, Cmd/Ctrl+Shift+G, Cmd/Ctrl+Shift+L).

import type { Editor } from '../editor/editor'
import { editable, groupSelection, isLocked, members, selectedGroups, setLocked, topItems, ungroup } from '../editor/grouping'

export function canGroup(editor: Editor): boolean {
  return topItems(editor.session.doc, editable(editor.session.doc, editor.selection.list())).length >= 2
}

export function canUngroup(editor: Editor): boolean {
  return selectedGroups(editor.session.doc, editor.selection.list()).length > 0
}

/** Groups the (unlocked) selection and keeps it selected. */
export function groupSelected(editor: Editor) {
  const doc = editor.session.doc
  const id = groupSelection(editor.session, editable(doc, editor.selection.list()), editor.library)
  if (id) editor.selection.set(members(doc, id))
}

export function ungroupSelected(editor: Editor) {
  const ids = editor.selection.list()
  for (const g of selectedGroups(editor.session.doc, ids)) ungroup(editor.session, g, editor.library)
  editor.selection.set(ids.filter((id) => editor.session.doc.hasObject(id)))
}

/** Locks the selection (whole groups as groups), or unlocks it if it's all locked. */
export function toggleLockSelected(editor: Editor) {
  const doc = editor.session.doc
  const items = topItems(doc, editor.selection.list())
  if (!items.length) return
  const lock = !items.every((id) => isLocked(doc, id))
  setLocked(editor.session, items, lock, editor.library)
  if (lock) editor.selection.clear()
}
