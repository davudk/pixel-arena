// Saved terrain brushes in number slots, like RTS control groups: Cmd/Ctrl+1-9 (Alt+1-9 in a
// browser, where Cmd/Ctrl+digit switches tabs) saves the current brush to that slot, a plain
// digit recalls it. Stored per player with the other UI preferences.

import { terrainSettings } from '../editor/terrain-tool'
import { PALETTE } from '../render/terrain-shading'
import { ui, type SavedBrush } from './ui-state.svelte'

export const SLOTS = 9

const LABEL: Record<SavedBrush['mode'], string> = { raise: 'Raise', lower: 'Lower', smooth: 'Smooth', flatten: 'Flatten', paint: 'Paint' }

export function brushLabel(b: SavedBrush): string {
  if (b.name) return b.name
  const what = b.mode === 'paint' ? (PALETTE[b.material]?.name ?? 'Paint') : LABEL[b.mode]
  return `${what} ${Number.isInteger(b.radius) ? b.radius : b.radius.toFixed(1)} m · ${Math.round(b.strength * 100)}%`
}

/** Saves the current terrain brush to `slot` (or the lowest free one). Returns the slot, or
 *  null when every slot is taken. */
export function saveBrush(slot?: number): number | null {
  const used = new Set(ui.brushes.map((b) => b.slot))
  const target = slot ?? [...Array(SLOTS).keys()].map((i) => i + 1).find((s) => !used.has(s))
  if (target === undefined) return null
  const keepName = ui.brushes.find((b) => b.slot === target)?.name ?? ''
  const brush: SavedBrush = {
    slot: target, name: keepName, mode: terrainSettings.mode, material: terrainSettings.material,
    radius: terrainSettings.radius, strength: terrainSettings.strength,
  }
  ui.brushes = [...ui.brushes.filter((b) => b.slot !== target), brush].sort((a, b) => a.slot - b.slot)
  return target
}

/** Loads a saved brush into the terrain settings. Returns false if the slot is empty. */
export function loadBrush(slot: number): boolean {
  const b = ui.brushes.find((x) => x.slot === slot)
  if (!b) return false
  terrainSettings.mode = b.mode
  terrainSettings.material = b.material
  terrainSettings.radius = b.radius
  terrainSettings.strength = b.strength
  terrainSettings.changed.emit()
  return true
}

export function deleteBrush(slot: number) {
  ui.brushes = ui.brushes.filter((b) => b.slot !== slot)
}

export function renameBrush(slot: number, name: string) {
  ui.brushes = ui.brushes.map((b) => (b.slot === slot ? { ...b, name: name.trim() } : b))
}

/** Moves a brush to another slot, swapping with whatever is there. */
export function moveBrush(from: number, to: number) {
  if (from === to) return
  ui.brushes = ui.brushes
    .map((b) => (b.slot === from ? { ...b, slot: to } : b.slot === to ? { ...b, slot: from } : b))
    .sort((a, b) => a.slot - b.slot)
}

/** Whether the current settings are exactly this brush (to highlight it). */
export function isCurrent(b: SavedBrush): boolean {
  const s = terrainSettings
  return b.mode === s.mode && b.radius === s.radius && b.strength === s.strength && (b.mode !== 'paint' || b.material === s.material)
}
