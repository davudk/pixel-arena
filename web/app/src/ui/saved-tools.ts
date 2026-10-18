// Saved tools: a registry tool with the parameters it keeps (see `saved` in tools.ts), optionally
// on a number key 1-9 like RTS control groups. Cmd/Ctrl+digit (Alt+digit in a browser, where
// Cmd/Ctrl+digit switches tabs) saves the tool in hand on that key, a plain digit picks it up.
// Saved tools without a key are picked from the panels or the hotbar. Stored per player.

import type { Library } from '../library/library'
import type { Editor } from '../editor/editor'
import { params, type ParamTool } from '../editor/tool-params'
import { inHand, pickUp, TOOLS } from '../editor/tools'
import { ui, type SavedTool } from './ui-state.svelte'

export const SLOTS = 9

/** The parameters a saved copy of `tool` keeps, from current values or `from`. */
function kept(tool: ParamTool, from: Record<string, unknown> = params[tool] as unknown as Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of TOOLS[tool].params) if (p.saved !== false) out[p.key] = from[p.key]
  return out
}

/** The tool in hand as a saved-tool spec, or null when nothing savable is in hand. */
export function capture(editor: Editor): Pick<SavedTool, 'tool' | 'params'> | null {
  const tool = inHand(editor)
  return tool && TOOLS[tool].saveable ? { tool, params: kept(tool) } : null
}

/** Same tool and equal on every kept parameter. */
function same(a: Pick<SavedTool, 'tool' | 'params'>, b: Pick<SavedTool, 'tool' | 'params'>): boolean {
  return a.tool === b.tool && Object.keys(a.params).every((k) => a.params[k] === b.params[k])
}

/** Saves the tool in hand, on `slot` or without a key. Saving the same tool again reuses its
 *  entry (and moves it to `slot`); a tool already on `slot` keeps its entry but loses the key.
 *  Returns the saved tool, or null when nothing savable is in hand. */
export function saveTool(editor: Editor, slot: number | null = null): SavedTool | null {
  const spec = capture(editor)
  if (!spec) return null
  const existing = ui.tools.find((t) => same(t, spec))
  const saved: SavedTool = existing ? { ...existing, slot: slot ?? existing.slot } : { id: crypto.randomUUID(), slot, name: '', ...spec }
  ui.tools = [
    ...ui.tools.filter((t) => t.id !== saved.id).map((t) => (slot !== null && t.slot === slot ? { ...t, slot: null } : t)),
    saved,
  ]
  return saved
}

/** Picks a saved tool up with its parameters. */
export function useSaved(editor: Editor, id: string): boolean {
  const t = ui.tools.find((x) => x.id === id)
  return !!t && pickUp(editor, t.tool, t.params as never)
}

/** The saved entry matching the tool in hand, if any. */
export function activeId(editor: Editor | null): string | null {
  const spec = editor && capture(editor)
  return spec ? (ui.tools.find((t) => same(t, spec))?.id ?? null) : null
}

export function setSlot(id: string, slot: number | null) {
  ui.tools = ui.tools.map((t) => (t.id === id ? { ...t, slot } : slot !== null && t.slot === slot ? { ...t, slot: null } : t))
}

export function rename(id: string, name: string) {
  ui.tools = ui.tools.map((t) => (t.id === id ? { ...t, name: name.trim() } : t))
}

export function remove(id: string) {
  ui.tools = ui.tools.filter((t) => t.id !== id)
}

/** Keyed tools by key, then the rest in the order they were saved. */
export function ordered(tools: SavedTool[]): SavedTool[] {
  const keyed = tools.filter((t) => t.slot !== null).sort((a, b) => a.slot! - b.slot!)
  return [...keyed, ...tools.filter((t) => t.slot === null)]
}

export function describe(t: SavedTool, library: Library | null): string {
  return TOOLS[t.tool].describe(t.params, library)
}

export function label(t: SavedTool, library: Library | null): string {
  return t.name || describe(t, library)
}
