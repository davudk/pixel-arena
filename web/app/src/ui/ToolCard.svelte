<script lang="ts">
  // A saved tool as a square card (hotbar and the panels' Saved sections): its picture, number
  // key (if any) and a short name. Click picks it up; right-click asks for the edit menu.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import ToolIcon from './ToolIcon.svelte'
  import { describe } from './saved-tools'
  import type { SavedTool } from './ui-state.svelte'

  interface Props {
    tool: SavedTool
    active: boolean
    library: Library | null
    thumbnails?: Thumbnails | null
    onuse: () => void
    onmenu: (anchor: HTMLElement) => void
  }
  let { tool, active, library, thumbnails = null, onuse, onmenu }: Props = $props()

  /** Its name, else the first part of its description ("Smooth", "Paint Dirt", "Bed"). */
  const short = $derived(tool.name || describe(tool, library).split(' · ')[0])
</script>

<button class="card" class:on={active} aria-pressed={active} title="{describe(tool, library)}{tool.slot ? ` (${tool.slot})` : ''}"
  onclick={onuse} oncontextmenu={(e) => { e.preventDefault(); onmenu(e.currentTarget as HTMLElement) }}>
  {#if tool.slot}<span class="key">{tool.slot}</span>{/if}
  <ToolIcon {tool} size={22} {library} {thumbnails} />
  <span class="name">{short}</span>
</button>

<style>
  .card {
    position: relative; flex: none; width: 62px; height: 62px; padding: 4px 3px 3px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 4px; border-radius: var(--radius-card); min-width: 0;
  }
  .key { position: absolute; top: 3px; left: 5px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .card.on .key { color: var(--accent); }
  .name { font-size: 10px; color: var(--muted); width: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
