<script lang="ts">
  // Water mode's catalogue (under the current-tool card, which holds size and basin settings):
  // saved water tools; the tools (Draw an outline, paint with the Brush, Erase; picking the one in
  // hand again puts it down); the liquid used by Draw and Brush; and the map's bodies with their
  // liquid, size and surface height (click one to move the camera to it; its swatch changes its
  // liquid). Bodies never overlap: see editor/water-shapes.ts.
  import { onDestroy } from 'svelte'
  import type { MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged, setParams } from '../editor/tool-params'
  import { inHand, pickUp, putDown } from '../editor/tools'
  import { shapeArea, worldShape } from '../editor/water-shapes'
  import { liquid, LIQUIDS, type LiquidDef } from '../world/liquids'
  import Icon from './Icon.svelte'
  import Popover from './Popover.svelte'
  import SavedTools from './SavedTools.svelte'
  import { key } from './keys'
  import { objectPosition } from './objects'

  interface Props {
    editor: Editor
    active: string | null
    onuse: (id: string) => void
  }
  let { editor, active, onuse }: Props = $props()

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

  type WaterTool = 'water' | 'waterBrush' | 'waterErase'
  const TOOL_TILES: { id: WaterTool; label: string; icon: string; title: string }[] = [
    { id: 'water', label: 'Draw', icon: 'droplet', title: `Draw an outline: click corners, then the first corner (or ${key('Enter')}) to finish` },
    { id: 'waterBrush', label: 'Brush', icon: 'brush', title: `Paint with a round brush (${key('[')} and ${key(']')} change its size)` },
    { id: 'waterErase', label: 'Erase', icon: 'eraser', title: 'Erase water with a round brush (the ground stays as it is)' },
  ]
  /** The water tool last picked up (a liquid choice picks it up again). */
  let last: WaterTool = $state('water')
  const now = $derived.by(() => {
    rev
    const hand = inHand(editor)
    const tool = (hand === 'water' || hand === 'waterBrush' || hand === 'waterErase' ? hand : null) as WaterTool | null
    return { tool, liquid: params.water.liquid }
  })
  $effect(() => {
    if (now.tool) last = now.tool
  })

  function toggle(id: WaterTool) {
    if (now.tool === id) putDown(editor)
    else pickUp(editor, id)
  }

  /** Draw and Brush share the liquid; picking one picks up Draw, or keeps the brush in hand. */
  function chooseLiquid(id: string) {
    setParams('water', { liquid: id })
    setParams('waterBrush', { liquid: id })
    if (now.tool !== 'water' && now.tool !== 'waterBrush') pickUp(editor, last === 'waterBrush' ? 'waterBrush' : 'water')
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
  <SavedTools mode="water" {active} library={editor.library} {onuse} />

  <section class="section">
    <h3 class="heading">Tool</h3>
    <div class="tiles">
      {#each TOOL_TILES as t (t.id)}
        {@const on = now.tool === t.id}
        <button class="tile" class:on aria-pressed={on} title={t.title} onclick={() => toggle(t.id)}><Icon name={t.icon} size={20} /><span>{t.label}</span></button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h3 class="heading">Liquid</h3>
    <div class="choices">
      {#each LIQUIDS as l (l.id)}
        {@const on = now.liquid === l.id && (now.tool === 'water' || now.tool === 'waterBrush')}
        <button class="choice" class:on aria-pressed={on} onclick={() => chooseLiquid(l.id)}>
          <span class="swatch lg" class:glow={l.glow > 0} style:background={swatch(l)} style:--glow={l.shallow}></span><span>{l.name}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h3 class="heading">Bodies</h3>
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
  .body { padding: 2px 6px 2px 2px; }
  .body .name { flex: 1; min-width: 0; text-align: left; color: var(--text); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .body .name:hover:not(:disabled) { color: var(--accent); }
  .meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
