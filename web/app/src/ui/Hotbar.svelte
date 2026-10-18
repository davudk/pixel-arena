<script lang="ts">
  // Saved brushes along the bottom-left of the screen as square cards with their number key;
  // scrolls sideways when there are more than fit. Click (or press the number) to use one,
  // right-click to rename, re-key or delete it.
  import BrushIcon from './BrushIcon.svelte'
  import BrushMenu from './BrushMenu.svelte'
  import { brushLabel } from './brushes'
  import { ui } from './ui-state.svelte'

  interface Props {
    /** Slot of the brush currently in use (highlighted), if any. */
    active: number | null
    onuse: (slot: number) => void
  }
  let { active, onuse }: Props = $props()

  let menu: { slot: number; anchor: HTMLElement } | null = $state(null)
  const short = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)} m`
</script>

{#if ui.brushes.length}
  <div class="hotbar" role="toolbar" aria-label="Saved brushes">
    {#each ui.brushes as b (b.slot)}
      <button class="card" class:on={active === b.slot} title="{brushLabel(b)} ({b.slot}) · right-click to edit"
        onclick={() => onuse(b.slot)}
        oncontextmenu={(e) => { e.preventDefault(); menu = { slot: b.slot, anchor: e.currentTarget as HTMLElement } }}>
        <span class="key">{b.slot}</span>
        <BrushIcon brush={b} size={22} />
        <span class="size">{b.name || short(b.radius)}</span>
      </button>
    {/each}
  </div>
{/if}

{#if menu}
  <BrushMenu slot={menu.slot} anchor={menu.anchor} placement="above" onclose={() => (menu = null)} />
{/if}

<style>
  .hotbar {
    pointer-events: auto; display: flex; gap: 6px; padding: 6px; max-width: 100%; overflow-x: auto;
    border-radius: 12px; background: var(--panel); border: 1px solid var(--line);
    backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .card {
    position: relative; flex: none; width: 58px; height: 58px; padding: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 4px; border-radius: 9px;
  }
  .card.on { border-color: var(--accent); background: rgba(242, 193, 78, 0.14); color: var(--accent); }
  .key { position: absolute; top: 3px; left: 5px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .size { font-size: 10px; color: var(--muted); max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
