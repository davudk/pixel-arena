<script lang="ts">
  // Prop library panel: text search, theme chips, category list and a thumbnail grid.
  // Choosing a prop starts placing it.
  import type { Library, PropDef } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'

  interface Props {
    library: Library
    thumbnails: Thumbnails
    selected: string | null
    randomRotation: boolean
    onchoose: (prop: PropDef) => void
  }
  let { library, thumbnails, selected, randomRotation = $bindable(), onchoose }: Props = $props()

  let query = $state('')
  let theme = $state('')
  let category = $state('')
  let urls: Record<string, string> = $state({})

  const results = $derived(library.search(query, theme, category))
  const shown = $derived(results.slice(0, 300))
  const categories = $derived([...library.categories()])
  const themes = library.themes()
  const chosen = $derived(selected ? library.props.get(selected) : undefined)

  thumbnails.onReady = (id, url) => (urls[id] = url)
  $effect(() => thumbnails.prioritize(shown))

  function thumb(p: PropDef): string | null {
    return urls[p.id] ?? thumbnails.get(p)
  }
</script>

<aside class="browser">
  <input class="search" placeholder="Search props…" bind:value={query} />
  <div class="chips">
    <button class:on={theme === ''} onclick={() => (theme = '')}>all</button>
    {#each themes as t (t)}
      <button class:on={theme === t} onclick={() => (theme = theme === t ? '' : t)}>{t}</button>
    {/each}
  </div>
  <nav class="categories">
    <button class:on={category === ''} onclick={() => (category = '')}>All props <span>{library.props.size}</span></button>
    {#each categories as [path, count] (path)}
      <button class:on={category === path} style:padding-left="{10 + (path.split('/').length - 1) * 14}px"
        onclick={() => (category = category === path ? '' : path)}>{path.split('/').pop()} <span>{count}</span></button>
    {/each}
  </nav>
  <div class="grid">
    {#each shown as p (p.id)}
      {@const url = thumb(p)}
      <button class="tile" class:on={selected === p.id} title="{p.name}&#10;{p.category} · {p.themes.join(', ')}" onclick={() => onchoose(p)}>
        {#if url}<img src={url} alt="" />{:else}<div class="ph"></div>{/if}
        <span>{p.name}</span>
      </button>
    {/each}
  </div>
  <footer>
    {#if chosen}
      <strong>{chosen.name}</strong> · {chosen.category}<br />
      {library.packs.get(chosen.packId)?.name} by {chosen.attribution.author} ({chosen.attribution.license})
    {:else}
      {results.length} props{results.length > shown.length ? ` (showing ${shown.length})` : ''}
    {/if}
    <label class="random"><input type="checkbox" bind:checked={randomRotation} /> Random rotation</label>
  </footer>
</aside>

<style>
  .browser {
    display: flex; flex-direction: column; gap: 10px; padding: 12px; height: 100%;
    background: #1b1e25; border-right: 1px solid var(--line); min-height: 0;
  }
  .search {
    width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line);
    background: #0f1115; color: var(--text); outline: none; font: inherit;
  }
  .search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(242, 193, 78, 0.16); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chips button {
    padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); background: transparent;
    color: var(--muted); font-size: 11.5px;
  }
  .chips button:hover { color: var(--text); }
  .chips button.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); border-color: transparent; }
  .categories {
    display: flex; flex-direction: column; max-height: 170px; overflow-y: auto;
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px 0;
  }
  .categories button {
    display: flex; justify-content: space-between; padding: 4px 10px; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); text-align: left; text-transform: capitalize;
  }
  .categories button span { opacity: 0.6; font-variant-numeric: tabular-nums; }
  .categories button:hover { background: rgba(255, 255, 255, 0.04); color: var(--text); }
  .categories button.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); }
  .grid {
    flex: 1; min-height: 0; overflow-y: auto; display: grid;
    grid-template-columns: repeat(auto-fill, minmax(82px, 1fr)); gap: 6px; align-content: start;
  }
  .tile {
    display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px;
    border-radius: 10px; border: 1px solid transparent; background: rgba(255, 255, 255, 0.03);
    color: var(--muted); font-size: 10.5px;
  }
  .tile:hover { background: rgba(255, 255, 255, 0.07); color: var(--text); }
  .tile.on { border-color: var(--accent); background: rgba(242, 193, 78, 0.16); color: var(--text); }
  .tile img, .tile .ph { width: 64px; height: 64px; image-rendering: pixelated; }
  .tile .ph { border-radius: 8px; background: linear-gradient(110deg, #22262e 30%, #2c313b 50%, #22262e 70%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  .tile span { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  footer { color: var(--muted); font-size: 11.5px; line-height: 1.5; }
  footer strong { color: var(--text); }
  .random { display: flex; gap: 6px; align-items: center; margin-top: 6px; color: var(--text); }
</style>
