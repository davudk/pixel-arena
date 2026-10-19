<script lang="ts">
  // Build mode's catalogue. Premade (Build / Erase / Premade switch in the tools container):
  // whole buildings by category, placed like props. Otherwise: the piece (structure: floor, wall, stairs, room; openings: door,
  // window, doorway), the room type while painting rooms (each with its floor), and the kit for
  // new buildings (picking either picks up
  // Build with it). Build / Erase and the level are in the tools container; the kit and roof of
  // an existing building are in Selection.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp, PREMADE_CATEGORIES, TOOLS } from '../editor/tools'
  import Icon from './Icon.svelte'
  import type { PremadeDef, PropDef } from '../library/library'
  import { thumbUrls, ui } from './ui-state.svelte'
  import { ROOM_NAMES } from '../editor/labels'
  import type { RoomChoice } from '../editor/tool-params'
  import { ROOM_FLOORS } from '../world/building-visuals'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))
  const options = TOOLS.build.params.find((p) => p.key === 'piece')!.options!
  /** Pieces in two rows: what a building is made of, and what goes in its walls. */
  const SECTIONS: [string, string[]][] = [['Structure', ['foundation', 'wall', 'stairs', 'room']], ['Openings', ['door', 'window', 'doorway']]]
  const ROOMS: RoomChoice[] = ['living', 'bedroom', 'kitchen', 'dining', 'bathroom', 'hall', 'office', 'classroom', 'shop', 'storage', 'ward', 'reception', 'garage', 'none']
  /** A patch of each room type's floor texture. */
  const roomSwatch = (r: RoomChoice) => {
    if (r === 'none') return { color: 'transparent', image: null }
    const f = ROOM_FLOORS[r]
    const def = [...editor.library.terrain.values()].find((t) => t.name === f.material)
    return { color: f.color, image: def ? `url("${def.url}")` : null }
  }
  const sections = SECTIONS.map(([title, ids]) => [title, ids.map((id) => options.find((o) => o.value === id)!)] as const)

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const view = $derived.by(() => {
    rev
    const kit = editor.library.kits.get(params.build.kit)
    const hand = inHand(editor)
    return {
      piece: params.build.piece, kit: params.build.kit, room: params.build.room, erasing: hand === 'build' && params.build.piece === 'erase',
      stairs: kit?.style !== 'block' && !!kit?.pieces.stairs?.length, rooms: kit?.style !== 'block',
      premade: hand === 'premade' || (hand !== 'build' && ui.buildTool === 'premade'), building: params.premade.prop,
    }
  })

  /** Premade buildings by category: the furnished ones (library.buildings), then whole-building
   *  models without interiors (props in PREMADE_CATEGORIES). Each with a thumbnail. */
  type Entry = { id: string; name: string; title: string; kind: 'building' | 'prop'; def: PremadeDef | PropDef }
  const furnished = new Map<string, Entry[]>()
  for (const b of editor.library.buildings.values()) {
    if (!furnished.has(b.category)) furnished.set(b.category, [])
    furnished.get(b.category)!.push({ id: b.id, name: b.name, title: `${b.name} · ${b.size[0]} × ${b.size[1]} m · ${b.storeys} ${b.storeys === 1 ? 'storey' : 'storeys'}`, kind: 'building', def: b })
  }
  const simple = PREMADE_CATEGORIES.map(([category, title]) => [`${title} (no interior)`, editor.library.search('', '', category).filter((p) => p.category === category)
    .map((p): Entry => ({ id: p.id, name: p.name, title: `${p.name} · ${p.footprint[0]} × ${p.footprint[1]} m`, kind: 'prop', def: p }))] as const)
    .filter(([, list]) => list.length)
  /** Homes first, then commercial, then civic. */
  const ORDER = ['Houses', 'Row houses', 'Town houses', 'Apartments', 'Shops', 'Offices', 'Schools', 'Hospitals', 'Police stations', 'Fire stations', 'City halls']
  const rank = (c: string) => (ORDER.indexOf(c) + 999) % 999
  const premade = [...[...furnished.entries()].sort((a, b) => rank(a[0]) - rank(b[0])), ...simple]
  $effect(() => {
    if (view.premade) editor.thumbnails.prioritize(premade.flatMap(([, list]) => list))
  })
  const thumb = (e: Entry) => thumbUrls[e.id] ?? (e.kind === 'building' ? editor.thumbnails.getBuilding(e.def as PremadeDef) : editor.thumbnails.get(e.def as PropDef))
</script>

<div class="panel-body">
  {#if view.premade}
    {#each premade as [title, list] (title)}
      <section class="section">
        <div class="heading-row"><h3 class="heading">{title}</h3><span class="count">{list.length}</span></div>
        <div class="choices">
          {#each list as p (p.id)}
            {@const on = view.building === p.id}
            {@const url = thumb(p)}
            <button class="choice building" class:on aria-pressed={on} title={p.title}
              onclick={() => pickUp(editor, 'premade', { prop: p.id })}>
              {#if url}<img src={url} alt="" draggable="false" />{:else}<span class="ph"></span>{/if}<span>{p.name}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {:else}
  {#each sections as [title, items] (title)}
    <section class="section">
      <h3 class="heading">{title}</h3>
      <div class="tiles">
        <!-- Stairs and rooms only for kits that have them (hidden, as the kit is chosen right here). -->
        {#each items.filter((p) => (p.value !== 'stairs' || view.stairs) && (p.value !== 'room' || view.rooms)) as p (p.value)}
          {@const on = view.piece === p.value}
          <button class="tile" class:on aria-pressed={on}
            onclick={() => pickUp(editor, 'build', { piece: p.value as never })}><Icon name={p.icon ?? ''} size={20} /><span>{p.label}</span></button>
        {/each}
      </div>
    </section>
  {/each}

  {#if view.piece === 'room' && view.rooms}
    <section class="section">
      <h3 class="heading">Room type</h3>
      <div class="choices">
        {#each ROOMS as r (r)}
          {@const on = view.room === r}
          {@const sw = roomSwatch(r)}
          <button class="choice" class:on aria-pressed={on} onclick={() => pickUp(editor, 'build', { piece: 'room', room: r })}>
            <span class="swatch lg tex" class:none={r === 'none'} style:background-color={sw.color} style:background-image={sw.image}></span><span>{ROOM_NAMES[r]}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="section">
    <h3 class="heading">Kit</h3>
    <div class="choices">
      {#each kits as k (k.id)}
        {@const on = view.kit === k.id && !view.erasing}
        <button class="choice" class:on aria-pressed={on} onclick={() => pickUp(editor, 'build', view.erasing ? { kit: k.id, piece: 'wall' } : { kit: k.id })}>
          <svg viewBox="0 0 48 40" aria-hidden="true">
            <path d="M4 20 L24 6 L44 20 Z" fill={k.colors.roof} />
            <rect x="9" y="20" width="30" height="13" fill={k.colors.gable} />
            <rect x="21" y="25" width="6" height="8" fill="rgba(0,0,0,0.35)" />
            <rect x="6" y="33" width="36" height="4" fill={k.colors.foundation} />
          </svg>
          <span>{k.name}</span>
        </button>
      {/each}
    </div>
  </section>
  {/if}
</div>

<style>
  /* A patch of the room's floor texture. */
  .building { min-height: 52px; }
  .building img, .building .ph { flex: none; width: 40px; height: 40px; object-fit: contain; image-rendering: pixelated; }
  .tex { background-size: 48px; background-position: center; image-rendering: pixelated; }
  .tex.none { box-shadow: inset 0 0 0 1px var(--line); background: repeating-linear-gradient(45deg, transparent 0 4px, var(--line) 4px 5px); }
</style>
