<script lang="ts">
  // Prop panel. Top: the theme picker (a popover of theme cards beside the panel). Then a
  // toolbar: search, category filter (tree of checkboxes) and view options (cards / list, card
  // size, group by, sort). Then favourites, recently placed and the props, grouped. Choosing a
  // prop starts placing it; props can also be dragged onto the map.
  import type { Library, PropDef } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import Icon from './Icon.svelte'
  import SavedTools from './SavedTools.svelte'
  import Popover from './Popover.svelte'
  import { RECENT_MAX, thumbUrls, toggleFavourite, ui, type CardSize, type GroupBy, type SortBy } from './ui-state.svelte'
  import { categoryTree, filterProps, groupProps, propTooltip, sortProps, themeCover, type CategoryNode, type Group } from './prop-list'

  interface Props {
    library: Library
    thumbnails: Thumbnails
    selected: string | null
    usage: Map<string, number>
    onchoose: (prop: PropDef) => void
    /** Saved prop tools: the one in hand, pick one up, save the one in hand. */
    activeSaved: string | null
    onuse: (id: string) => void
    onsave: () => void
  }
  let { library, thumbnails, selected, usage, onchoose, activeSaved, onuse, onsave }: Props = $props()

  let panel: HTMLElement = $state()!
  let themeButton: HTMLButtonElement = $state()!
  let filterButton: HTMLButtonElement = $state()!
  let viewButton: HTMLButtonElement = $state()!
  let open: 'theme' | 'filter' | 'view' | null = $state(null)
  let query = $state('')
  let themeQuery = $state('')
  let descending = $state(false)
  const collapsed = $derived(new Set(ui.collapsedGroups))

  const themes = library.themes()
  const themeCount = (t: string) => (t ? [...library.props.values()].filter((p) => p.themes.includes(t)).length : library.props.size)
  const tree = categoryTree(library)
  if (!themes.includes(ui.theme)) ui.theme = ''

  const hidden = $derived(new Set(ui.hiddenCategories))
  const results = $derived(filterProps(library, { query, theme: ui.theme, hidden }))
  const sorted = $derived(sortProps(results, ui.sortBy, descending, { recent: ui.recent, usage }))
  const groups = $derived.by((): Group[] => {
    const out: Group[] = []
    const inResults = new Set(results.map((p) => p.id))
    const pick = (ids: string[]) => ids.map((id) => library.props.get(id)).filter((p): p is PropDef => !!p && inResults.has(p.id))
    const favs = pick(ui.favourites)
    if (favs.length) out.push({ key: ':favourites', label: 'Favourites', detail: '', props: favs })
    const recent = pick(ui.recent.slice(0, RECENT_MAX))
    if (recent.length && !query && ui.sortBy !== 'recent') out.push({ key: ':recent', label: 'Recently placed', detail: '', props: recent })
    return [...out, ...groupProps(sorted, ui.groupBy, library)]
  })
  const chosen = $derived(selected ? library.props.get(selected) : undefined)
  const hiddenCount = $derived(ui.hiddenCategories.length)

  $effect(() => thumbnails.prioritize(sorted.slice(0, 120)))

  function thumb(p: PropDef): string | null {
    return thumbUrls[p.id] ?? thumbnails.get(p)
  }

  // --- Themes -------------------------------------------------------------------------------
  const themeCards = $derived(
    ['', ...themes]
      .filter((t) => !themeQuery || (t || 'all themes').includes(themeQuery.toLowerCase()))
      .map((t) => ({ theme: t, count: themeCount(t), cover: themeCover(library, t) })),
  )
  $effect(() => {
    if (open === 'theme') thumbnails.prioritize(themeCards.flatMap((c) => c.cover))
  })
  function chooseTheme(t: string) {
    ui.theme = t
    open = null
    themeQuery = ''
  }

  // --- Category filter ----------------------------------------------------------------------
  function checkState(n: CategoryNode): 'on' | 'off' | 'some' {
    const off = n.leaves.filter((l) => hidden.has(l)).length
    return off === 0 ? 'on' : off === n.leaves.length ? 'off' : 'some'
  }
  function toggle(n: CategoryNode) {
    const show = checkState(n) !== 'on'
    const rest = ui.hiddenCategories.filter((c) => !n.leaves.includes(c))
    ui.hiddenCategories = show ? rest : [...rest, ...n.leaves]
  }
  /** Shows only this category (everything else hidden). */
  function only(n: CategoryNode) {
    ui.hiddenCategories = tree.flatMap((r) => r.leaves).filter((l) => !n.leaves.includes(l))
  }

  const pretty = (s: string) => s.replace(/_/g, ' ')
  const round1 = (n: number) => Math.round(n * 10) / 10
  const SIZES: Record<CardSize, number> = { s: 52, m: 68, l: 92 }
  const GROUPS: [GroupBy, string][] = [['none', 'None'], ['category', 'Category'], ['subcategory', 'Subcategory'], ['pack', 'Pack']]
  const SORTS: [SortBy, string][] = [['name', 'Name'], ['size', 'Footprint'], ['height', 'Height'], ['recent', 'Recently placed'], ['used', 'Most used in map']]

  function dragStart(e: DragEvent, p: PropDef) {
    e.dataTransfer?.setData('application/x-pixel-arena-prop', p.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
  }
</script>

{#snippet tile(p: PropDef)}
  {@const url = thumb(p)}
  {@const fav = ui.favourites.includes(p.id)}
  <div class="item" class:on={selected === p.id} class:list={ui.viewMode === 'list'} title={propTooltip(p, library)}
    role="button" tabindex="0" draggable="true" ondragstart={(e) => dragStart(e, p)}
    onclick={() => onchoose(p)} onkeydown={(e) => e.key === 'Enter' && onchoose(p)}>
    {#if url}<img src={url} alt="" draggable="false" />{:else}<div class="ph"></div>{/if}
    <span class="label">{p.name}</span>
    {#if ui.viewMode === 'list'}
      <span class="meta">{round1(p.footprint[0])}×{round1(p.footprint[1])} m</span>
    {/if}
    <button class="star" class:fav aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
      onclick={(e) => { e.stopPropagation(); toggleFavourite(p.id) }}><Icon name="star" size={13} filled={fav} /></button>
  </div>
{/snippet}

{#snippet node(n: CategoryNode, depth: number)}
  {@const s = checkState(n)}
  <div class="node" style:padding-left="{6 + depth * 16}px">
    <label>
      <input type="checkbox" checked={s === 'on'} indeterminate={s === 'some'} onchange={() => toggle(n)} />
      <span class="cap">{pretty(n.name)}</span>
    </label>
    <span class="count">{n.count}</span>
    <button class="only" onclick={() => only(n)} title="Show only this">only</button>
  </div>
  {#each n.children as c (c.path)}{@render node(c, depth + 1)}{/each}
{/snippet}

<aside class="browser" bind:this={panel}>
  <SavedTools mode="props" active={activeSaved} {library} {thumbnails} {onuse} />
  <button class="theme" class:open={open === 'theme'} bind:this={themeButton} onclick={() => (open = open === 'theme' ? null : 'theme')}>
    <Icon name="palette" />
    <span class:cap={!!ui.theme}>{ui.theme ? pretty(ui.theme) : 'All themes'}</span>
    <span class="count">{themeCount(ui.theme)}</span>
    <Icon name="chevronRight" />
  </button>

  <div class="toolbar">
    <label class="search">
      <Icon name="search" size={14} />
      <input placeholder="Search props" bind:value={query} />
      {#if query}<button class="clear" aria-label="Clear search" onclick={() => (query = '')}><Icon name="x" size={12} /></button>{/if}
    </label>
    <button class="icon" class:active={hiddenCount > 0} bind:this={filterButton}
      title={hiddenCount > 0 ? 'Filter categories (some hidden)' : 'Filter categories'}
      onclick={() => (open = open === 'filter' ? null : 'filter')}>
      <Icon name="filter" />{#if hiddenCount > 0}<span class="badge"></span>{/if}
    </button>
    <button class="icon" bind:this={viewButton} title="View options" onclick={() => (open = open === 'view' ? null : 'view')}>
      <Icon name={ui.viewMode === 'list' ? 'list' : 'grid'} />
    </button>
  </div>

  <div class="results" style:--card="{SIZES[ui.cardSize]}px">
    {#each groups as g (g.key)}
      {#if g.label}
        <button class="group" onclick={() => {
          ui.collapsedGroups = collapsed.has(g.key) ? ui.collapsedGroups.filter((k) => k !== g.key) : [...ui.collapsedGroups, g.key]
        }}>
          <Icon name={collapsed.has(g.key) ? 'chevronRight' : 'chevronDown'} size={13} />
          <span class="cap">{pretty(g.label)}</span>{#if g.detail}<span class="detail cap">{pretty(g.detail)}</span>{/if}
          <span class="count">{g.props.length}</span>
        </button>
      {/if}
      {#if !collapsed.has(g.key)}
        <div class={ui.viewMode === 'list' ? 'rows' : 'cards'}>
          {#each g.props as p (p.id)}{@render tile(p)}{/each}
        </div>
      {/if}
    {:else}
      <p class="empty">No props match{query ? ` “${query}”` : ''}.{#if hiddenCount}<br /><button class="link" onclick={() => (ui.hiddenCategories = [])}>Show all categories</button>{/if}</p>
    {/each}
  </div>

  {#if chosen}
    <footer>
      <div class="chosen">
        <div>
          <strong>{chosen.name}</strong> · {round1(chosen.footprint[0])} × {round1(chosen.footprint[1])} m<br />
          <span class="muted">{library.packs.get(chosen.packId)?.name} · {chosen.attribution.author} ({chosen.attribution.license})</span>
        </div>
        <button class="save" onclick={onsave} title="Save this prop with its rotation and snap settings (Cmd/Ctrl+1–9 saves it on a number key)"><Icon name="plus" size={13} /> Save</button>
      </div>
    </footer>
  {/if}
</aside>

{#if open === 'theme'}
  <Popover anchor={themeButton} placement="right" rightOf={panel} width={340} onclose={() => (open = null)}>
    <div class="pop-head">
      <label class="search">
        <Icon name="search" size={14} />
        <input placeholder="Search themes" bind:value={themeQuery} />
      </label>
    </div>
    <div class="themes">
      {#each themeCards as c (c.theme)}
        <button class="theme-card" class:on={ui.theme === c.theme} onclick={() => chooseTheme(c.theme)}>
          <div class="cover">
            {#each c.cover as p (p.id)}
              {@const url = thumb(p)}
              {#if url}<img src={url} alt="" />{:else}<div class="ph"></div>{/if}
            {/each}
          </div>
          <span class:cap={!!c.theme}>{c.theme ? pretty(c.theme) : 'All themes'}</span>
          <span class="count">{c.count}</span>
        </button>
      {:else}
        <p class="empty">No themes match.</p>
      {/each}
    </div>
  </Popover>
{/if}

{#if open === 'filter'}
  <Popover anchor={filterButton} width={270} onclose={() => (open = null)}>
    <div class="pop-head row">
      <strong>Categories</strong>
      <button class="link" onclick={() => (ui.hiddenCategories = [])} disabled={hiddenCount === 0}>Show all</button>
    </div>
    <div class="tree">
      {#each tree as n (n.path)}{@render node(n, 0)}{/each}
    </div>
  </Popover>
{/if}

{#if open === 'view'}
  <Popover anchor={viewButton} width={250} onclose={() => (open = null)}>
    <div class="options">
      <div class="seg" role="group" aria-label="Layout">
        <button class:on={ui.viewMode === 'cards'} onclick={() => (ui.viewMode = 'cards')}><Icon name="grid" size={14} /> Cards</button>
        <button class:on={ui.viewMode === 'list'} onclick={() => (ui.viewMode = 'list')}><Icon name="list" size={14} /> List</button>
      </div>
      {#if ui.viewMode === 'cards'}
        <div class="field">Card size
          <div class="seg small" role="group" aria-label="Card size">
            {#each ['s', 'm', 'l'] as const as k (k)}<button class:on={ui.cardSize === k} onclick={() => (ui.cardSize = k)}>{k.toUpperCase()}</button>{/each}
          </div>
        </div>
      {/if}
      <label class="field">Group by
        <select bind:value={ui.groupBy}>{#each GROUPS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
      </label>
      <div class="field">Sort by
        <div class="sort">
          <select bind:value={ui.sortBy}>{#each SORTS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
          <button class="icon" title={descending ? 'Descending' : 'Ascending'} onclick={() => (descending = !descending)}>
            <Icon name={descending ? 'down' : 'up'} size={14} />
          </button>
        </div>
      </div>
    </div>
  </Popover>
{/if}

<style>
  .browser { display: flex; flex-direction: column; gap: 10px; padding: 10px; flex: 1; min-height: 0; }
  .cap { text-transform: capitalize; }
  .count { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 11.5px; }
  .muted { color: var(--muted); }

  .theme {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; text-align: left;
    background: rgba(242, 193, 78, 0.1); border-color: rgba(242, 193, 78, 0.25); color: var(--text); font-weight: 500;
  }
  .theme > span:not(.count) { flex: 1; }
  .theme.open, .theme:hover:not(:disabled) { background: rgba(242, 193, 78, 0.18); }

  .toolbar { display: flex; gap: 6px; }
  .search {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-radius: 8px;
    border: 1px solid var(--line); background: #0f1115; color: var(--muted);
  }
  .search:focus-within { border-color: var(--accent); }
  .search input { flex: 1; min-width: 0; padding: 7px 0; border: 0; outline: none; background: transparent; color: var(--text); font: inherit; }
  .clear { padding: 2px; border: 0; background: transparent; color: var(--muted); }
  .icon { position: relative; display: flex; align-items: center; justify-content: center; padding: 6px 8px; }
  .icon.active { color: var(--accent); border-color: rgba(242, 193, 78, 0.4); }
  .badge { position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; border-radius: 4px; background: var(--accent); }

  .results { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-right: -4px; padding-right: 4px; }
  .group {
    display: flex; align-items: center; gap: 6px; padding: 6px 2px 2px; border: 0; background: transparent;
    color: var(--text); font-size: 12px; font-weight: 500; text-align: left; position: sticky; top: 0; z-index: 1;
    background: #1b1e25;
  }
  .group:hover:not(:disabled) { background: #1b1e25; color: var(--accent); }
  .group .detail { color: var(--muted); font-weight: 400; }
  .group .count { margin-left: auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--card) + 12px), 1fr)); gap: 5px; }
  .rows { display: flex; flex-direction: column; gap: 1px; }

  .item {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px;
    border-radius: 9px; border: 1px solid transparent; background: rgba(255, 255, 255, 0.03);
    color: var(--muted); font-size: 10.5px; cursor: pointer; outline: none;
  }
  .item:hover, .item:focus-visible { background: rgba(255, 255, 255, 0.07); color: var(--text); }
  .item.on { border-color: var(--accent); background: rgba(242, 193, 78, 0.14); color: var(--text); }
  .item img, .item .ph { width: var(--card); height: var(--card); image-rendering: pixelated; }
  .item .label { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
  .item.list { flex-direction: row; gap: 8px; padding: 3px 6px; font-size: 12px; background: transparent; }
  .item.list:hover { background: rgba(255, 255, 255, 0.05); }
  .item.list.on { background: rgba(242, 193, 78, 0.14); }
  .item.list img, .item.list .ph { width: 30px; height: 30px; }
  .item.list .label { flex: 1; text-align: left; }
  .item.list .meta { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .ph { border-radius: 6px; background: linear-gradient(110deg, #22262e 30%, #2c313b 50%, #22262e 70%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  .star {
    position: absolute; top: 3px; right: 3px; padding: 3px; border: 0; border-radius: 6px; background: rgba(20, 22, 28, 0.7);
    color: var(--muted); opacity: 0; transition: opacity 0.1s;
  }
  .item.list .star { position: static; background: transparent; }
  .item:hover .star, .star.fav { opacity: 1; }
  .star.fav { color: var(--accent); }
  .star:hover:not(:disabled) { color: var(--accent); background: rgba(20, 22, 28, 0.9); }

  .empty { color: var(--muted); text-align: center; padding: 20px 8px; margin: 0; line-height: 1.6; }
  .link { border: 0; background: transparent; padding: 0; color: var(--accent); }
  .link:hover:not(:disabled) { background: transparent; text-decoration: underline; }
  .chosen { display: flex; align-items: center; gap: 8px; }
  .chosen > div { flex: 1; min-width: 0; }
  .chosen .save { display: flex; align-items: center; gap: 4px; padding: 5px 9px; flex: none; }
  footer { color: var(--text); font-size: 11.5px; line-height: 1.5; border-top: 1px solid var(--line); padding-top: 8px; }

  /* Popovers */
  .pop-head { padding: 10px; border-bottom: 1px solid var(--line); }
  .pop-head.row { display: flex; align-items: center; justify-content: space-between; }
  .themes { overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .theme-card {
    display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px; border-radius: 10px;
    background: rgba(255, 255, 255, 0.03); border: 1px solid transparent; text-align: left; font-size: 12px;
  }
  .theme-card.on { border-color: var(--accent); background: rgba(242, 193, 78, 0.12); }
  .theme-card .cover { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; border-radius: 7px; overflow: hidden; background: #262a33; aspect-ratio: 1; }
  .theme-card .cover img, .theme-card .cover .ph { width: 100%; height: 100%; aspect-ratio: 1; image-rendering: pixelated; border-radius: 0; }
  .theme-card .count { font-size: 10.5px; margin-top: -3px; }
  .tree { overflow-y: auto; padding: 6px 4px 8px; }
  .node { display: flex; align-items: center; gap: 6px; padding-right: 8px; border-radius: 6px; }
  .node:hover { background: rgba(255, 255, 255, 0.04); }
  .node label { flex: 1; display: flex; align-items: center; gap: 7px; padding: 4px 0; cursor: pointer; }
  .only { padding: 1px 6px; font-size: 10.5px; border: 0; background: transparent; color: var(--muted); visibility: hidden; }
  .node:hover .only { visibility: visible; }
  .only:hover:not(:disabled) { color: var(--accent); background: transparent; }
  .options { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); }
  .field select { flex: none; width: 140px; }
  .sort { display: flex; gap: 4px; }
  .sort select { width: 108px; }
  .seg { display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: #15171c; }
  .seg button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; border-color: transparent; background: transparent; padding: 5px 8px; color: var(--muted); }
  .seg button.on { background: #30353f; color: var(--accent); }
  .seg.small button { padding: 3px 10px; font-size: 11.5px; }
</style>
