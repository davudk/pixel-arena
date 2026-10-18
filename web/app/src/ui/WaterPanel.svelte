<script lang="ts">
  // Water mode's left panel: "Draw water" (picks up the water tool; again puts it down), then
  // the map's water bodies with their size and surface height. Click one to move the camera to it.
  import { onDestroy } from 'svelte'
  import { PackedVec2Array, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import { objectPosition } from './objects'
  import { WaterTool } from '../editor/water-tool'
  import { pickUp, putDown } from '../editor/tools'
  import { saveTool } from './saved-tools'
  import Icon from './Icon.svelte'
  import SavedTools from './SavedTools.svelte'

  interface Props {
    editor: Editor
    active: string | null
    onuse: (id: string) => void
  }
  let { editor, active, onuse }: Props = $props()

  let rev = $state(0)
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    const offs = [s.doc.changed.connect(() => rev++), s.doc.reset.connect(() => rev++)]
    offDoc = () => offs.forEach((f) => f())
    rev++
  }
  watch(editor.session)
  let armed = $state(editor.tool instanceof WaterTool)
  const offs = [editor.sessionChanged.connect(watch), editor.toolChanged.connect((t) => (armed = t instanceof WaterTool))]
  onDestroy(() => {
    offDoc()
    offs.forEach((f) => f())
  })

  function toggleDraw() {
    if (armed) putDown(editor)
    else pickUp(editor, 'water')
  }

  /** Polygon area (shoelace). */
  function area(poly: PackedVec2Array): number {
    const pts = poly.points
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      a += p.x * q.y - q.x * p.y
    }
    return Math.abs(a) / 2
  }

  const bodies = $derived.by(() => {
    rev
    return [...editor.session.doc.objects.values()]
      .filter((o) => !o.deleted && o.type === 'water')
      .map((o, i) => {
        const poly = o.props.get('polygon')
        return { id: o.id, name: `Water ${i + 1}`, area: poly instanceof PackedVec2Array ? area(poly) : 0, level: objectPosition(o).y }
      })
  })

  function focus(id: string) {
    const obj = editor.session.doc.getObject(id)
    if (obj) editor.rig.focus.set(objectPosition(obj).x, 0, objectPosition(obj).z)
  }
</script>

<div class="panel-body">
  <SavedTools mode="water" {active} library={editor.library} {onuse} />
  <div class="row">
    <button class="draw" class:on={armed} aria-pressed={armed} onclick={toggleDraw}><Icon name="droplet" size={20} /> Draw water</button>
    <button class="save" disabled={!armed} title={armed ? 'Save this tool (Cmd/Ctrl+1–9 saves it on a number key)' : 'Pick the tool first'}
      aria-label="Save tool" onclick={() => saveTool(editor)}><Icon name="plus" size={14} /></button>
  </div>
  <h3>Water bodies</h3>
  {#each bodies as b (b.id)}
    <button class="body" onclick={() => focus(b.id)}>
      <span class="swatch"></span>
      <span class="name">{b.name}</span>
      <span class="meta">{Math.round(b.area)} m² · {b.level.toFixed(1)} m</span>
    </button>
  {:else}
    <p class="empty">No water yet</p>
  {/each}
</div>

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; }
  h3 { margin: 4px 2px 4px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .body { display: flex; align-items: center; gap: 8px; padding: 6px 8px; text-align: left; border-color: transparent; background: rgba(255, 255, 255, 0.03); }
  .swatch { width: 18px; height: 18px; border-radius: 5px; background: #4aa3d8; flex: none; }
  .name { flex: 1; }
  .meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .empty { color: var(--muted); margin: 0; padding: 12px 2px; }
  .row { display: flex; gap: 6px; margin-bottom: 8px; }
  .draw { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; }
  .save { display: flex; align-items: center; padding: 0 12px; }
  .draw.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
</style>
