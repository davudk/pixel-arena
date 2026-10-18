<script lang="ts">
  // "Saved" section at the top of a mode's panel: the saved tools of that mode's tools (see
  // MODE_TOOLS) as the same square cards as the hotbar, wrapping to the panel's width. Click to
  // pick one up, right-click to rename, re-key or delete.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import { MODE_TOOLS, type Mode } from '../editor/tools'
  import ToolCard from './ToolCard.svelte'
  import ToolMenu from './ToolMenu.svelte'
  import { ordered } from './saved-tools'
  import { ui } from './ui-state.svelte'

  interface Props {
    mode: Mode
    active: string | null
    library: Library | null
    thumbnails?: Thumbnails | null
    onuse: (id: string) => void
  }
  let { mode, active, library, thumbnails = null, onuse }: Props = $props()

  const tools = $derived(ordered(ui.tools).filter((t) => MODE_TOOLS[mode].includes(t.tool)))
  let menu: { id: string; anchor: HTMLElement } | null = $state(null)
</script>

{#if tools.length}
  <section class="saved">
    <h3>Saved</h3>
    <div class="cards">
      {#each tools as t (t.id)}
        <ToolCard tool={t} active={active === t.id} {library} {thumbnails} onuse={() => onuse(t.id)}
          onmenu={(anchor) => (menu = { id: t.id, anchor })} />
      {/each}
    </div>
  </section>
{/if}

{#if menu}
  <ToolMenu id={menu.id} anchor={menu.anchor} {library} onclose={() => (menu = null)} />
{/if}

<style>
  .saved { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0 2px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .cards { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
