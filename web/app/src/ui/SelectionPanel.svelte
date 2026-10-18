<script lang="ts">
  // Selected objects. One object: what it is, and its position and rotation as editable numbers
  // (descendants move with it). Several: the count. Actions match the bottom bar's.
  import { onDestroy } from 'svelte'
  import { Vec3, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import type { SelectTool } from '../editor/select-tool'

  interface Props {
    editor: Editor
    /** The select tool (switching to it if needed) for running an action. */
    selectTool: () => SelectTool
  }
  let { editor, selectTool }: Props = $props()

  let rev = $state(0)
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    offDoc = s.doc.changed.connect(() => rev++)
    rev++
  }
  watch(editor.session)
  const offs = [editor.selection.changed.connect(() => rev++), editor.sessionChanged.connect(watch)]
  onDestroy(() => {
    offDoc()
    offs.forEach((f) => f())
  })

  const info = $derived.by(() => {
    rev
    const ids = editor.selection.list()
    if (ids.length !== 1) return { count: ids.length, single: null }
    const obj = editor.session.doc.getObject(ids[0])
    if (!obj) return { count: 0, single: null }
    const p = (obj.props.get('position') as Vec3) ?? Vec3.ZERO
    const lib = editor.library
    const name = obj.type === 'prop' ? (lib.props.get(String(obj.props.get('prop')))?.name ?? String(obj.props.get('prop')))
      : obj.type === 'building' ? `Building · ${lib.kits.get(String(obj.props.get('kit')))?.name ?? ''}` : obj.type === 'water' ? 'Water' : obj.type
    const deg = ((Number(obj.props.get('rotation') ?? 0) * 180) / Math.PI + 360) % 360
    return { count: 1, single: { name, x: p.x, y: p.y, z: p.z, deg } }
  })

  const fmt = (n: number) => String(Math.round(n * 100) / 100)

  function setAxis(axis: 'x' | 'y' | 'z', value: string) {
    const v = Number(value)
    const s = info.single
    if (!s || !Number.isFinite(v) || v === s[axis]) return
    selectTool().translateSelection(new Vec3(axis === 'x' ? v - s.x : 0, axis === 'y' ? v - s.y : 0, axis === 'z' ? v - s.z : 0))
  }

  function setRotation(value: string) {
    const v = Number(value)
    const s = info.single
    if (!s || !Number.isFinite(v)) return
    const delta = ((((v - s.deg) % 360) + 540) % 360) - 180
    if (Math.abs(delta) > 1e-6) selectTool().rotateSelectionBy((delta * Math.PI) / 180)
  }

  const commit = (fn: (v: string) => void) => (e: Event) => fn((e.currentTarget as HTMLInputElement).value)
  const enter = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
</script>

{#if info.count === 0}
  <p class="muted">Nothing selected. Click an object, or drag a box.</p>
{:else if info.single}
  <p class="name">{info.single.name}</p>
  <div class="grid">
    {#each ['x', 'y', 'z'] as const as a (a)}
      <label>{a.toUpperCase()}<input class="num" type="number" step="0.25" value={fmt(info.single[a])} onchange={commit((v) => setAxis(a, v))} onkeydown={enter} /></label>
    {/each}
    <label>Rot<input class="num" type="number" step="15" value={fmt(info.single.deg)} onchange={commit(setRotation)} onkeydown={enter} /></label>
  </div>
{:else}
  <p class="name">{info.count} objects</p>
{/if}

<style>
  .muted { margin: 0; color: var(--muted); font-size: 12px; }
  .name { margin: 0 0 8px; font-weight: 500; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 10px; }
  label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11.5px; }
  .num {
    flex: 1; min-width: 0; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--line); background: #0f1115;
    color: var(--text); font: inherit; font-variant-numeric: tabular-nums;
  }
  .num:focus { outline: none; border-color: var(--accent); }
</style>
