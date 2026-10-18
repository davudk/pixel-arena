<script lang="ts">
  // Every saved tool along the bottom of the screen as square cards (keyed ones first). Takes the
  // room it's given and scrolls sideways when full: a thin scrollbar, faded edges where cards
  // are hidden, and the mouse wheel scrolls it. Click (or press the number) to pick one up,
  // right-click to rename, re-key or delete.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import ToolCard from './ToolCard.svelte'
  import ToolMenu from './ToolMenu.svelte'
  import { ordered } from './saved-tools'
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
  let strip: HTMLDivElement | undefined = $state()
  let more = $state({ left: false, right: false })

  function measure() {
    if (!strip) return
    more = { left: strip.scrollLeft > 1, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 }
  }

  /** A vertical wheel scrolls the strip sideways (trackpads already scroll sideways). */
  function wheel(e: WheelEvent) {
    if (!strip || Math.abs(e.deltaX) > Math.abs(e.deltaY) || strip.scrollWidth <= strip.clientWidth) return
    strip.scrollLeft += e.deltaY
    e.preventDefault()
  }

  // Re-measure when the strip resizes or the cards change.
  $effect(() => {
    tools.length
    if (!strip) return
    const ro = new ResizeObserver(measure)
    ro.observe(strip)
    for (const c of strip.children) ro.observe(c)
    measure()
    return () => ro.disconnect()
  })
</script>

{#if tools.length}
  <div class="hotbar" role="toolbar" aria-label="Saved tools">
    <div class="strip" class:fade-left={more.left} class:fade-right={more.right} bind:this={strip} onscroll={measure} onwheel={wheel}>
      {#each tools as t (t.id)}
        <ToolCard tool={t} active={active === t.id} {library} {thumbnails} onuse={() => onuse(t.id)}
          onmenu={(anchor) => (menu = { id: t.id, anchor })} />
      {/each}
    </div>
  </div>
{/if}

{#if menu}
  <ToolMenu id={menu.id} anchor={menu.anchor} {library} placement="above" onclose={() => (menu = null)} />
{/if}

<style>
  .hotbar {
    pointer-events: auto; min-width: 0; max-width: 100%; padding: 6px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .strip {
    display: flex; gap: 6px; overflow-x: auto; overscroll-behavior-x: contain;
    scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
  }
  .strip::-webkit-scrollbar { height: 6px; }
  .strip::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); border-radius: 3px; }
  /* Fade the edge where more cards are hidden. */
  .strip.fade-right { mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }
  .strip.fade-left { mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent); }
  .strip.fade-left.fade-right { mask-image: linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent); }
</style>
