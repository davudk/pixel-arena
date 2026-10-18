<script lang="ts">
  // Props mode's catalogue (placement settings are in the tools container): the theme picker (a
  // popover of theme cards beside the panel), a toolbar (search, category filter, list options:
  // layout, card size, group by, sort by), then favorites, recently placed and the props,
  // grouped. Choosing a prop picks it up for placing; props can also be dragged onto the map.
  import type { Library, PropDef } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import Icon from './Icon.svelte'
  import Popover from './Popover.svelte'
  import SearchField from './SearchField.svelte'
  import { RECENT_MAX, thumbUrls, toggleFavourite, ui, type CardSize, type GroupBy, type SortBy } from './ui-state.svelte'
  import { categoryTree, filterProps, groupProps, propTooltip, sortProps, themeCover, type CategoryNode, type Group } from './prop-list'

  interface Props {
    library: Library
    thumbnails: Thumbnails
    selected: string | null
    usage: Map<string, number>
    onchoose: (prop: PropDef) => void
  }
  let { library, thumbnails, selected, usage, onchoose }: Props = $props()

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
    if (favs.length) out.push({ key: ':favourites', label: 'Favorites', detail: '', props: favs })
    const recent = pick(ui.recent.slice(0, RECENT_MAX))
    if (recent.length && !query && ui.sortBy !== 'recent') out.push({ key: ':recent', label: 'Recently placed', detail: '', props: recent })
    return [...out, ...groupProps(sorted, ui.groupBy, library)]
  })
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
  // Same wording as the outliner's view options: "Group by" / "Sort by", "None" last.
  const GROUPS: [GroupBy, string][] = [['category', 'Category'], ['subcategory', 'Subcategory'], ['pack', 'Pack'], ['none', 'None']]
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
      <span class="meta">{round1(p.footprint[0])} × {round1(p.footprint[1])} m</span>
    {/if}
    <button class="star bare" class:fav aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} title={fav ? 'Remove from favorites' : 'Add to favorites'}
      onclick={(e) => { e.stopPropagation(); toggleFavourite(p.id) }}><Icon name="star" size={13} filled={fav} /></button>
  </div>
{/snippet}

{#snippet node(n: CategoryNode, depth: number)}
  {@const s = checkState(n)}
  <div class="node" style:padding-left="{6 + depth * 16}px">
    <label class="check">
      <input type="checkbox" checked={s === 'on'} indeterminate={s === 'some'} onchange={() => toggle(n)} />
      <span class="cap">{pretty(n.name)}</span>
    </label>
    <span class="count">{n.count}</span>
    <button class="only bare" onclick={() => only(n)} title="Show only this category">Only</button>
  </div>
  {#each n.children as c (c.path)}{@render node(c, depth + 1)}{/each}
{/snippet}

<aside class="browser" bind:this={panel}>
  <button class="theme" class:open={open === 'theme'} bind:this={themeButton} title="Choose a theme" onclick={() => (open = open === 'theme' ? null : 'theme')}>
    <Icon name="palette" />
    <span class="name" class:cap={!!ui.theme}>{ui.theme ? pretty(ui.theme) : 'All themes'}</span>
    <span class="count">{themeCount(ui.theme)}</span>
    <Icon name="chevronRight" size={13} />
  </button>

  <div class="toolbar">
    <SearchField bind:value={query} placeholder="Search props" />
    <button class="icon" class:filtered={hiddenCount > 0} bind:this={filterButton} aria-label="Filter categories"
      title={hiddenCount > 0 ? 'Filter categories (some hidden)' : 'Filter categories'}
      onclick={() => (open = open === 'filter' ? null : 'filter')}>
      <Icon name="filter" />{#if hiddenCount > 0}<span class="badge"></span>{/if}
    </button>
    <button class="icon" bind:this={viewButton} title="List options" aria-label="List options" onclick={() => (open = open === 'view' ? null : 'view')}>
      <Icon name="sliders" />
    </button>
  </div>

  <div class="results" style:--card="{SIZES[ui.cardSize]}px">
    {#each groups as g (g.key)}
      {#if g.label}
        <button class="group-head" onclick={() => {
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
      <p class="empty">{query ? `No props match “${query}”` : 'No props in these categories'}{#if hiddenCount}<br /><button class="link" onclick={() => (ui.hiddenCategories = [])}>Show all categories</button>{/if}</p>
    {/each}
  </div>
</aside>

{#if open === 'theme'}
  <Popover anchor={themeButton} placement="right" rightOf={panel} width={340} onclose={() => (open = null)}>
    <div class="pop-head"><SearchField bind:value={themeQuery} placeholder="Search themes" /></div>
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
        <p class="empty">No themes match “{themeQuery}”</p>
      {/each}
    </div>
  </Popover>
{/if}

{#if open === 'filter'}
  <Popover anchor={filterButton} width={270} onclose={() => (open = null)}>
    <div class="pop-head">
      <span class="heading">Categories</span>
      <button class="link" onclick={() => (ui.hiddenCategories = [])} disabled={hiddenCount === 0}>Show all categories</button>
    </div>
    <div class="tree">
      {#each tree as n (n.path)}{@render node(n, 0)}{/each}
    </div>
  </Popover>
{/if}

{#if open === 'view'}
  <Popover anchor={viewButton} width={290} onclose={() => (open = null)}>
    <div class="pop">
      <div class="field"><span class="label">Layout</span>
        <div class="seg" role="group" aria-label="Layout">
          <button class:on={ui.viewMode === 'cards'} onclick={() => (ui.viewMode = 'cards')}><Icon name="grid" size={14} />Cards</button>
          <button class:on={ui.viewMode === 'list'} onclick={() => (ui.viewMode = 'list')}><Icon name="list" size={14} />List</button>
        </div>
      </div>
      {#if ui.viewMode === 'cards'}
        <div class="field"><span class="label">Card size</span>
          <div class="seg" role="group" aria-label="Card size">
            {#each [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']] as const as [k, l] (k)}<button class:on={ui.cardSize === k} onclick={() => (ui.cardSize = k)}>{l}</button>{/each}
          </div>
        </div>
      {/if}
      <label class="field"><span class="label">Group by</span>
        <select bind:value={ui.groupBy}>{#each GROUPS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
      </label>
      <div class="field"><span class="label">Sort by</span>
        <div class="sort">
          <select bind:value={ui.sortBy} aria-label="Sort by">{#each SORTS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
          <button class="icon" title={descending ? 'Descending' : 'Ascending'} aria-label={descending ? 'Descending' : 'Ascending'} onclick={() => (descending = !descending)}>
            <Icon name={descending ? 'down' : 'up'} size={14} />
          </button>
        </div>
      </div>
    </div>
  </Popover>
{/if}

<style>
  .browser { display: flex; flex-direction: column; gap: 6px; padding: 10px; flex: 1; min-height: 0; }
  .cap { text-transform: capitalize; }

  .theme { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-card); text-align: left; font-weight: 500; }
  .theme .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .theme .count { margin-left: 0; }
  .theme.open { border-color: var(--accent-border); }

  .toolbar { display: flex; gap: 6px; }
  .icon { position: relative; }
  .icon.filtered { color: var(--accent); }
  .badge { position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; border-radius: 4px; background: var(--accent); }

  .results { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-right: -4px; padding-right: 4px; }
  .group-head .detail { color: var(--muted); font-weight: 400; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--card) + 12px), 1fr)); gap: 4px; }
  .rows { display: flex; flex-direction: column; gap: 1px; }

  .item {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px;
    border-radius: var(--radius-card); border: 1px solid transparent; background: var(--card);
    color: var(--muted); font-size: 11px; cursor: pointer; outline: none;
  }
  .item:hover, .item:focus-visible { background: var(--hover); color: var(--text); }
  .item.on { border-color: var(--accent-border); background: var(--accent-bg); color: var(--accent); }
  .item img, .item .ph { width: var(--card); height: var(--card); image-rendering: pixelated; }
  .item .label { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
  .item.list { flex-direction: row; gap: 8px; padding: 3px 6px; font-size: 12.5px; background: transparent; border-radius: var(--radius-sm); }
  .item.list:hover { background: var(--hover); }
  .item.list.on { background: var(--accent-bg); border-color: transparent; }
  .item.list img, .item.list .ph { width: 30px; height: 30px; }
  .item.list .label { flex: 1; text-align: left; }
  .item.list .meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .ph { border-radius: var(--radius-sm); background: linear-gradient(110deg, #22262e 30%, #2c313b 50%, #22262e 70%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  .star { position: absolute; top: 3px; right: 3px; padding: 3px; border-radius: var(--radius-sm); background: rgba(20, 22, 28, 0.7); opacity: 0; transition: opacity 0.1s; }
  .item.list .star { position: static; background: transparent; }
  .item:hover .star, .star.fav { opacity: 1; }
  .star.fav, .star:hover:not(:disabled) { color: var(--accent); }

  /* Popovers */
  .themes { overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .theme-card {
    display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px; border-radius: var(--radius-card);
    background: var(--card); border: 1px solid transparent; text-align: left; font-size: 12px;
  }
  .theme-card:hover:not(:disabled) { background: var(--hover); }
  .theme-card .cover { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; border-radius: var(--radius-sm); overflow: hidden; background: var(--control); aspect-ratio: 1; }
  .theme-card .cover img, .theme-card .cover .ph { width: 100%; height: 100%; aspect-ratio: 1; image-rendering: pixelated; border-radius: 0; }
  .theme-card .count { margin-left: 0; }
  .tree { overflow-y: auto; padding: 4px; }
  .node { display: flex; align-items: center; gap: 6px; padding-right: 6px; border-radius: var(--radius-sm); }
  .node:hover { background: var(--hover); }
  .node .check { flex: 1; padding: 4px 0; cursor: pointer; }
  .node .count { margin-left: 0; }
  .only { padding: 1px 6px; font-size: 11px; visibility: hidden; }
  .node:hover .only { visibility: visible; }
  .only:hover:not(:disabled) { color: var(--accent); }
  .sort { display: flex; gap: 4px; }
  .sort select { flex: 1; }
</style>
