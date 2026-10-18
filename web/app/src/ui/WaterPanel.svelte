<script lang="ts">
  // Water mode's left panel: the map's water bodies with their size and surface height.
  // Click one to move the camera to it.
  import { onDestroy } from 'svelte'
  import { PackedVec2Array, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import { objectPosition } from './objects'

  let { editor }: { editor: Editor } = $props()

  let rev = $state(0)
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    const offs = [s.doc.changed.connect(() => rev++), s.doc.reset.connect(() => rev++)]
    offDoc = () => offs.forEach((f) => f())
    rev++
  }
  watch(editor.session)
  const offSession = editor.sessionChanged.connect(watch)
  onDestroy(() => {
    offDoc()
    offSession()
  })

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
</style>
