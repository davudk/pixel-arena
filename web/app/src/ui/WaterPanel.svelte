<script lang="ts">
  // Water mode's catalogue: the liquid to draw (picking one picks up Draw with it; Draw / Erase
  // and their settings are in the tools container), and the map's bodies with their
  // liquid, size and surface height (click one to move the camera to it; its swatch changes its
  // liquid). Bodies never overlap: see editor/water-shapes.ts.
  import { onDestroy } from 'svelte'
  import type { MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp } from '../editor/tools'
  import { shapeArea, worldShape } from '../editor/water-shapes'
  import { liquid, LIQUIDS, type LiquidDef } from '../world/liquids'
  import Popover from './Popover.svelte'
  import { objectPosition } from './objects'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  let rev = $state(0)
  const bump = () => rev++
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    const offs = [s.doc.changed.connect(bump), s.doc.reset.connect(bump)]
    offDoc = () => offs.forEach((f) => f())
    bump()
  }
  watch(editor.session)
  const offs = [editor.sessionChanged.connect(watch), editor.toolChanged.connect(bump), paramsChanged.connect(bump)]
  onDestroy(() => {
    offDoc()
    offs.forEach((f) => f())
  })

  const now = $derived.by(() => {
    rev
    return { erasing: inHand(editor) === 'waterErase', liquid: params.water.liquid }
  })

  /** Picking a liquid picks up Draw with it. */
  function chooseLiquid(id: string) {
    pickUp(editor, 'water', { liquid: id })
  }

  const bodies = $derived.by(() => {
    rev
    const count = new Map<string, number>()
    return [...editor.session.doc.objects.values()]
      .filter((o) => !o.deleted && o.type === 'water')
      .map((o) => {
        const l = liquid(o.props.get('liquid'))
        const n = (count.get(l.id) ?? 0) + 1
        count.set(l.id, n)
        const custom = o.props.get('name')
        const name = typeof custom === 'string' && custom ? custom : `${l.name} ${n}`
        return { id: o.id, liquid: l, name, area: shapeArea(worldShape(o)), level: objectPosition(o).y }
      })
  })

  function focus(id: string) {
    const obj = editor.session.doc.getObject(id)
    if (obj) editor.rig.focus.set(objectPosition(obj).x, 0, objectPosition(obj).z)
  }

  // Changing an existing body's liquid.
  let change: { id: string; name: string; anchor: HTMLElement } | null = $state(null)
  function setLiquid(id: string, name: string, to: LiquidDef) {
    const s = editor.session
    if (liquid(s.doc.getProp(id, 'liquid')).id !== to.id) s.edit(`Change ${name} to ${to.name.toLowerCase()}`, () => s.setProp(id, 'liquid', to.id))
    change = null
  }

  const swatch = (l: LiquidDef) => `linear-gradient(135deg, ${l.shallow} 0%, ${l.shallow} 45%, ${l.deep} 100%)`
</script>

<div class="panel-body">
  <section class="section">
    <h3 class="heading">Liquid</h3>
    <div class="choices">
      {#each LIQUIDS as l (l.id)}
        {@const on = now.liquid === l.id && !now.erasing}
        <button class="choice" class:on aria-pressed={on} onclick={() => chooseLiquid(l.id)}>
          <span class="swatch lg" class:glow={l.glow > 0} style:background={swatch(l)} style:--glow={l.shallow}></span><span>{l.name}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="section">
    <div class="heading-row"><h3 class="heading">In this map</h3><span class="count">{bodies.length}</span></div>
    {#each bodies as b (b.id)}
      <div class="list-row body">
        <button class="bare" title="Change liquid" aria-label="Change the liquid of {b.name}"
          onclick={(e) => (change = { id: b.id, name: b.name, anchor: e.currentTarget as HTMLElement })}>
          <span class="swatch" style:background={swatch(b.liquid)}></span>
        </button>
        <button class="bare name" onclick={() => focus(b.id)} title="Show on the map">{b.name}</button>
        <span class="meta">{Math.round(b.area)} m² · {b.level.toFixed(1)} m</span>
      </div>
    {:else}
      <p class="empty">No water yet</p>
    {/each}
  </section>
</div>

{#if change}
  {@const target = change}
  <Popover anchor={target.anchor} width={200} onclose={() => (change = null)}>
    <div class="menu-list" role="menu">
      {#each LIQUIDS as l (l.id)}
        <button role="menuitem" class:on={liquid(editor.session.doc.getProp(target.id, 'liquid')).id === l.id} onclick={() => setLiquid(target.id, target.name, l)}>
          <span class="swatch" style:background={swatch(l)}></span>{l.name}
        </button>
      {/each}
    </div>
  </Popover>
{/if}

<style>
  .swatch.glow { box-shadow: 0 0 8px var(--glow), inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
  .body .name { flex: 1; min-width: 0; text-align: left; color: var(--text); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .body .name:hover:not(:disabled) { color: var(--accent); }
  .meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
