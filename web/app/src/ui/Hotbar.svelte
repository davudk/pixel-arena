<script lang="ts">
  // Every saved tool along the bottom-left of the screen as square cards (keyed ones first,
  // with their number); scrolls sideways when there are more than fit. Click (or press the
  // number) to pick one up, right-click to rename, re-key or delete it.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import ToolIcon from './ToolIcon.svelte'
  import ToolMenu from './ToolMenu.svelte'
  import { describe, ordered } from './saved-tools'
  import { ui } from './ui-state.svelte'

  interface Props {
    active: string | null
    library: Library | null
    thumbnails: Thumbnails | null
    onuse: (id: string) => void
  }
  let { active, library, thumbnails, onuse }: Props = $props()

  const tools = $derived(ordered(ui.tools))
  let menu: { id: string; anchor: HTMLElement } | null = $state(null)
  /** A few characters for the card: its name, else the first part of its description. */
  const short = (t: (typeof tools)[number]) => t.name || describe(t, library).split(' · ')[0]
</script>

{#if tools.length}
  <div class="hotbar" role="toolbar" aria-label="Saved tools">
    {#each tools as t (t.id)}
      <button class="card" class:on={active === t.id} title="{describe(t, library)}{t.slot ? ` (${t.slot})` : ''}"
        onclick={() => onuse(t.id)}
        oncontextmenu={(e) => { e.preventDefault(); menu = { id: t.id, anchor: e.currentTarget as HTMLElement } }}>
        {#if t.slot}<span class="key">{t.slot}</span>{/if}
        <ToolIcon tool={t} size={22} {library} {thumbnails} />
        <span class="size">{short(t)}</span>
      </button>
    {/each}
  </div>
{/if}

{#if menu}
  <ToolMenu id={menu.id} anchor={menu.anchor} {library} placement="above" onclose={() => (menu = null)} />
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
  .size { font-size: 10px; color: var(--muted); max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: capitalize; }
</style>
