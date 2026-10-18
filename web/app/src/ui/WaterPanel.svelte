<script lang="ts">
  // Water mode's left panel: saved water tools; the tools (Draw an outline, paint with the Brush,
  // Erase; picking the one in hand again puts it down) and Save; the liquid (water, ocean, lava,
  // acid, ...) used by Draw and Brush; the brush size and the basin settings (depth and shore,
  // while "Dig basin" is on in the bottom bar) of the tool in hand; and the map's bodies with their
  // liquid, size and surface height. Click a body to move the camera to it; its swatch changes its
  // liquid. Bodies never overlap: see editor/water-shapes.ts.
  import { onDestroy } from 'svelte'
  import type { MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged, setParams, type ParamTool } from '../editor/tool-params'
  import { inHand, pickUp, putDown, TOOLS } from '../editor/tools'
  import { liquid, LIQUIDS, type LiquidDef } from '../world/liquids'
  import Icon from './Icon.svelte'
  import ParamControl from './ParamControl.svelte'
  import Popover from './Popover.svelte'
  import SavedTools from './SavedTools.svelte'
  import { objectPosition } from './objects'
  import { shapeArea, worldShape } from '../editor/water-shapes'
  import { saveTool } from './saved-tools'

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
    { id: 'water', label: 'Draw', icon: 'droplet', title: 'Draw an outline: click corners, then the first corner (or Enter) to finish · Backspace removes a corner · Esc cancels' },
    { id: 'waterBrush', label: 'Brush', icon: 'brush', title: 'Paint with a round brush · [ and ] change its size' },
    { id: 'waterErase', label: 'Erase', icon: 'eraser', title: 'Erase water with a round brush (the ground stays as it is)' },
  ]
  /** The water tool last picked up (its settings show when nothing is in hand). */
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
  /** Whose settings show: the tool in hand, else the last one used. */
  const shown = $derived<ParamTool>(now.tool ?? last)
  const sizeParams = $derived(TOOLS[shown].params.filter((p) => p.key === 'radius'))
  const basinParams = $derived(shown === 'waterErase' ? [] : TOOLS[shown].params.filter((p) => p.key === 'depth' || p.key === 'shore'))

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
        return { id: o.id, liquid: l, name: `${l.name} ${n}`, area: shapeArea(worldShape(o)), level: objectPosition(o).y }
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

  <div class="row">
    {#each TOOL_TILES as t (t.id)}
      {@const on = now.tool === t.id}
      <button class="tile" class:on aria-pressed={on} title={t.title} onclick={() => toggle(t.id)}><Icon name={t.icon} size={20} /><span>{t.label}</span></button>
    {/each}
    <button class="save" disabled={!now.tool} title={now.tool ? 'Save this tool (Cmd/Ctrl+1–9 saves it on a number key)' : 'Pick a tool first'}
      aria-label="Save tool" onclick={() => saveTool(editor)}><Icon name="plus" size={14} /></button>
  </div>

  <section>
    <h3>Liquid</h3>
    <div class="liquids">
      {#each LIQUIDS as l (l.id)}
        {@const on = now.liquid === l.id}
        <button class="liquid" class:on aria-pressed={on} onclick={() => chooseLiquid(l.id)}>
          <span class="swatch big" style:background={swatch(l)} class:glow={l.glow > 0} style:--glow={l.shallow}></span>
          <span>{l.name}</span>
        </button>
      {/each}
    </div>
  </section>

  {#if sizeParams.length}
    <section>
      <h3>Brush</h3>
      {#each sizeParams as def (`${shown}:${def.key}`)}
        <ParamControl tool={shown} {def} library={editor.library} />
      {/each}
    </section>
  {/if}

  {#if basinParams.length}
    <section>
      <h3>Basin</h3>
      {#each basinParams as def (`${shown}:${def.key}`)}
        <ParamControl tool={shown} {def} library={editor.library} />
      {/each}
    </section>
  {/if}

  <section>
    <h3>Bodies</h3>
    {#each bodies as b (b.id)}
      <div class="body">
        <button class="swatch-btn" title="Change liquid" aria-label="Change liquid of {b.name}"
          onclick={(e) => (change = { id: b.id, name: b.name, anchor: e.currentTarget as HTMLElement })}>
          <span class="swatch" style:background={swatch(b.liquid)}></span>
        </button>
        <button class="focus" onclick={() => focus(b.id)} title="Show on the map">
          <span class="name">{b.name}</span>
          <span class="meta">{Math.round(b.area)} m² · {b.level.toFixed(1)} m</span>
        </button>
      </div>
    {:else}
      <p class="empty">No water yet</p>
    {/each}
  </section>
</div>

{#if change}
  {@const target = change}
  <Popover anchor={target.anchor} width={200} onclose={() => (change = null)}>
    <div class="menu">
      {#each LIQUIDS as l (l.id)}
        <button class:on={liquid(editor.session.doc.getProp(target.id, 'liquid')).id === l.id} onclick={() => setLiquid(target.id, target.name, l)}>
          <span class="swatch" style:background={swatch(l)}></span>{l.name}
        </button>
      {/each}
    </div>
  </Popover>
{/if}

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; flex: 1; }
  section { display: flex; flex-direction: column; gap: 4px; }
  h3 { margin: 0 2px 2px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .row { display: flex; gap: 6px; }
  .tile { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; font-size: 11.5px; min-width: 0; }
  .save { display: flex; align-items: center; padding: 0 12px; }
  .on { background: rgba(242, 193, 78, 0.16) !important; color: var(--accent) !important; border-color: rgba(242, 193, 78, 0.45) !important; }
  .liquids { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 4px; }
  .liquid { display: flex; align-items: center; gap: 8px; padding: 5px 6px; text-align: left; font-size: 12px; }
  .swatch { display: block; width: 18px; height: 18px; border-radius: 5px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
  .swatch.big { width: 24px; height: 24px; border-radius: 6px; }
  .swatch.glow { box-shadow: 0 0 8px var(--glow), inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
  .body { display: flex; align-items: center; gap: 4px; border-radius: 8px; background: rgba(255, 255, 255, 0.03); }
  .swatch-btn { padding: 6px; border: 0; background: transparent; }
  .focus { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 2px; border: 0; background: transparent; text-align: left; }
  .focus:hover:not(:disabled) { background: transparent; color: var(--accent); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .empty { color: var(--muted); margin: 0; padding: 6px 2px; }
  .menu { padding: 6px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
  .menu button { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 0; background: transparent; text-align: left; }
  .menu button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); }
</style>
