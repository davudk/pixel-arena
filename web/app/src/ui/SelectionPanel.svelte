<script lang="ts">
  // The selected object's properties as rows (label column + one control): name, position
  // (X / Y / Z in one row; descendants move with it), rotation, and what its type has: a
  // building's kit and roof, a body of water's liquid. Several objects: their count. This is
  // the one place existing objects are edited; the mode panels only hold tools.
  import { onDestroy } from 'svelte'
  import { Vec3, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import type { SelectTool } from '../editor/select-tool'
  import { rename } from '../editor/grouping'
  import { objectName } from '../editor/labels'
  import { liquid, LIQUIDS } from '../world/liquids'
  import Icon from './Icon.svelte'

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

  const ROOFS: [string, string][] = [['gable', 'Gable'], ['hip', 'Hip'], ['flat', 'Flat'], ['none', 'None']]
  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))

  const info = $derived.by(() => {
    rev
    const ids = editor.selection.list()
    if (ids.length !== 1) return { count: ids.length, single: null }
    const obj = editor.session.doc.getObject(ids[0])
    if (!obj) return { count: 0, single: null }
    const p = (obj.props.get('position') as Vec3) ?? Vec3.ZERO
    const deg = ((Number(obj.props.get('rotation') ?? 0) * 180) / Math.PI + 360) % 360
    const custom = obj.props.get('name')
    return {
      count: 1,
      single: {
        id: obj.id, type: obj.type, name: typeof custom === 'string' ? custom : '', fallback: objectName(obj, editor.library),
        x: p.x, y: p.y, z: p.z, deg,
        kit: String(obj.props.get('kit') ?? ''), roof: String(obj.props.get('roof/style') ?? 'gable'), liquid: liquid(obj.props.get('liquid')).id,
        yaw: Number(obj.props.get('rotation') ?? 0),
        flowSpeed: Number(obj.props.get('flow_speed') ?? 0), flowDir: Number(obj.props.get('flow_dir') ?? 0),
      },
    }
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

  // Flow direction as eight arrows relative to the view ("↑" runs up the screen), stored in the
  // body's own frame (degrees; see world/water.ts).
  const ARROWS = [0, 1, 2, 3, 4, 5, 6, 7]
  /** World x / z of screen arrow i (0 = up, clockwise in 45° steps) for the current view. */
  function arrowWorld(i: number): [number, number] {
    const yaw = editor.rig.yaw
    const a = (i * Math.PI) / 4
    const up = [-Math.sin(yaw), -Math.cos(yaw)]
    const right = [Math.cos(yaw), -Math.sin(yaw)]
    return [up[0] * Math.cos(a) + right[0] * Math.sin(a), up[1] * Math.cos(a) + right[1] * Math.sin(a)]
  }
  /** The arrow nearest the body's flow, for the current view. */
  function currentArrow(flowDir: number, objYaw: number): number {
    const w = (flowDir * Math.PI) / 180 - objYaw
    let best = 0, bestDot = -2
    for (const i of ARROWS) {
      const [x, z] = arrowWorld(i)
      const d = x * Math.cos(w) + z * Math.sin(w)
      if (d > bestDot) [best, bestDot] = [i, d]
    }
    return best
  }
  function setFlowArrow(i: number) {
    const s = info.single
    if (!s) return
    const [x, z] = arrowWorld(i)
    const deg = Math.round((((Math.atan2(z, x) + s.yaw) * 180) / Math.PI + 360) % 360)
    setValue('Change flow direction', 'flow_dir', deg)
  }
  /** Speed shown while dragging; committed as one edit on release. */
  let flowDraft: number | null = $state(null)

  /** One undoable edit of one property of the selected object. */
  function setValue(label: string, key: string, value: number) {
    const s = info.single
    if (!s) return
    const session = editor.session
    if (session.doc.getProp(s.id, key) !== value) session.edit(`${label} of ${s.fallback}`, () => session.setProp(s.id, key, value))
  }

  /** One undoable edit of one property of the selected object. */
  function setProp(label: string, key: string, value: string) {
    const s = info.single
    if (!s) return
    const session = editor.session
    if (session.doc.getProp(s.id, key) !== value) session.edit(`${label} of ${s.fallback}`, () => session.setProp(s.id, key, value))
  }

  const commit = (fn: (v: string) => void) => (e: Event) => fn((e.currentTarget as HTMLInputElement).value)
  const enter = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
</script>

{#if info.count === 0}
  <p class="empty">Nothing selected</p>
{:else if info.single}
  {@const s = info.single}
  <div class="rows">
    <label class="field"><span class="label">Name</span>
      <input class="input" value={s.name} placeholder={s.fallback} onchange={commit((v) => rename(editor.session, s.id, v, editor.library))} onkeydown={enter} />
    </label>
    <div class="field stack"><span class="label">Position</span>
      <div class="vector">
        {#each ['x', 'y', 'z'] as const as a (a)}
          <label>{a.toUpperCase()}<input class="input" type="number" step="0.25" value={fmt(s[a])} onchange={commit((v) => setAxis(a, v))} onkeydown={enter} /></label>
        {/each}
      </div>
    </div>
    <label class="field"><span class="label">Rotation</span>
      <input class="input num" type="number" step="15" value={fmt(s.deg)} onchange={commit(setRotation)} onkeydown={enter} />
    </label>
    {#if s.type === 'building'}
      <label class="field"><span class="label">Kit</span>
        <select value={s.kit} onchange={commit((v) => setProp('Change kit', 'kit', v))}>
          {#each kits as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
        </select>
      </label>
      <div class="field"><span class="label">Roof</span>
        <div class="seg" role="group" aria-label="Roof">
          {#each ROOFS as [id, name] (id)}
            <button class:on={s.roof === id} aria-pressed={s.roof === id} onclick={() => setProp('Change roof', 'roof/style', id)}>{name}</button>
          {/each}
        </div>
      </div>
    {:else if s.type === 'water'}
      <label class="field"><span class="label">Liquid</span>
        <select value={s.liquid} onchange={commit((v) => setProp('Change liquid', 'liquid', v))}>
          {#each LIQUIDS as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
        </select>
      </label>
      {@const speed = flowDraft ?? s.flowSpeed}
      <div class="field"><span class="label">Flow</span>
        <div class="slider">
          <input type="range" min="0" max="3" step="0.1" value={speed} aria-label="Flow speed"
            oninput={(e) => (flowDraft = Number((e.currentTarget as HTMLInputElement).value))}
            onchange={(e) => { setValue('Change flow', 'flow_speed', Number((e.currentTarget as HTMLInputElement).value)); flowDraft = null }} />
          <span class="val"><span class="readout">{speed > 0 ? `${speed.toFixed(1)} m/s` : 'Still'}</span></span>
        </div>
      </div>
      {#if speed > 0}
        {@const on = currentArrow(s.flowDir, s.yaw)}
        <div class="field sub"><span class="label">Direction</span>
          <div class="seg arrows" role="group" aria-label="Flow direction">
            {#each ARROWS as i (i)}
              <button class:on={on === i} aria-pressed={on === i} aria-label="Flow toward {['up', 'up right', 'right', 'down right', 'down', 'down left', 'left', 'up left'][i]} on screen"
                onclick={() => setFlowArrow(i)}><span class="arrow" style:transform="rotate({i * 45}deg)"><Icon name="up" size={13} /></span></button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <p class="empty">{info.count} objects selected</p>
{/if}

<style>
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .num { font-variant-numeric: tabular-nums; }
  .readout { flex: 1; text-align: right; font-variant-numeric: tabular-nums; }
  .arrows button { padding: 4px 0; }
  .arrow { display: inline-flex; }
</style>
