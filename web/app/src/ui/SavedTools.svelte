<script lang="ts">
  // The saved tools of a mode's tools (see MODE_TOOLS) as the same square cards as the hotbar:
  // wrapping to the width, or with `row` one horizontally scrolling strip (under the current-tool
  // card). Click to pick one up, right-click to rename, re-key or delete. Nothing when none saved.
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
    row?: boolean
  }
  let { mode, active, library, thumbnails = null, onuse, row = false }: Props = $props()

  const tools = $derived(ordered(ui.tools).filter((t) => MODE_TOOLS[mode].includes(t.tool)))
  let menu: { id: string; anchor: HTMLElement } | null = $state(null)
</script>

{#if tools.length}
  <section class="saved" class:section={!row} class:row>
    <h3 class="heading">Saved</h3>
    <div class="cards" onwheel={(e) => {
      // A mouse wheel scrolls the row sideways.
      if (row && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() }
    }}>
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
  .cards { display: flex; flex-wrap: wrap; gap: 6px; }
  .row { display: flex; flex-direction: column; gap: 6px; }
  .row .cards { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -10px; padding: 0 10px; }
  .row .cards::-webkit-scrollbar { display: none; }
  .row .cards > :global(*) { flex: none; }
</style>
