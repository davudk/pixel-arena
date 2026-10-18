// Keyboard shortcuts as shown in tooltips and menus, written once per platform: on a Mac
// "⇧⌘G", "⌥1–9"; elsewhere "Ctrl+Shift+G", "Alt+1–9". Combos are given as "Mod+Shift+G" (Mod =
// Cmd on a Mac, Ctrl elsewhere).

import { desktop } from '../platform'

export const MAC = /Mac|iPhone|iPad/.test(navigator.platform)

const MAC_SYMBOLS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' }
const ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod']

/** "Mod+Shift+G" → "⇧⌘G" (Mac) or "Ctrl+Shift+G". Plain keys ("R", "Del", "PgUp") pass through. */
export function key(combo: string): string {
  const parts = combo.split('+')
  const main = parts.pop()!
  const mods = parts.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  if (MAC) return mods.map((m) => MAC_SYMBOLS[m] ?? m).join('') + main
  return [...mods.map((m) => (m === 'Mod' ? 'Ctrl' : m)), main].join('+')
}

/** "Undo (⌘Z)" style tooltip text. */
export const withKey = (label: string, combo: string) => `${label} (${key(combo)})`

/** The modifier that saves the tool in hand on a number key: Cmd/Ctrl in the desktop app, Alt in
 *  a browser (where Cmd/Ctrl+digit switches tabs). */
export const SAVE_MOD = desktop ? 'Mod' : 'Alt'
/** "⌘1–9" / "Ctrl+1–9" / "Alt+1–9". */
export const saveSlotKey = () => key(`${SAVE_MOD}+1–9`)
