<script lang="ts">
  // The selected object's properties as rows (label column + one control): name, position
  // (X / Y / Z in one row; descendants move with it), the way it faces (a dial), and what its
  // type has: a building's kit and roof, a body of water's liquid and flow (speed and a dial). Several objects: their count. This is
  // the one place existing objects are edited; the mode panels only hold tools.
  import { onDestroy } from 'svelte'
  import { Vec3, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import type { SelectTool } from '../editor/select-tool'
  import { rename } from '../editor/grouping'
  import { objectName } from '../editor/labels'
  import { liquid, LIQUIDS } from '../world/liquids'
  import DirectionDial from './DirectionDial.svelte'
  import { AXIS_COLORS } from '../editor/axes-gizmo'

  interface Props {
    editor: Editor
    /** The select tool (switching to it if needed) for running an action. */
    selectTool: () => SelectTool
    /** The view's yaw (radians), so direction dials turn with it. */
    viewYaw: number
  }
  let { editor, selectTool, viewYaw }: Props = $props()

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
    editor.axes.hide()
    editor.endPreview(false)
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
    // From the stored rotation (during a live preview it has just been reverted to the start).
    const now = ((((Number(editor.session.doc.getProp(s.id, 'rotation') ?? 0) * 180) / Math.PI) % 360) + 360) % 360
    const delta = ((((v - now) % 360) + 540) % 360) - 180
    if (Math.abs(delta) > 1e-6) selectTool().rotateSelectionBy((delta * Math.PI) / 180)
  }

  // Directions as compass bearings (degrees clockwise from north, which is -Z), shown on dials
  // turned like the view (DirectionDial). A rotation is the way the object faces: at rotation 0
  // its front (+Z) faces south. Flow is stored in the body's own frame (world/water.ts).
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const norm = (d: number) => ((d % 360) + 360) % 360
  const facing = (rotationDeg: number) => norm(180 - rotationDeg)
  /** A change of the selected object: shown live while a dial or slider is dragged
   *  (`done` false; see Editor.preview), or made for good as one undo step. */
  function live(label: string, fn: () => void, done: boolean) {
    const s = info.single
    if (!s) return
    editor.preview(`${label} of ${s.fallback}`, fn)
    if (done) editor.endPreview(true)
  }
  function setFacing(bearing: number, done = true) {
    live('Rotate', () => setRotation(String(norm(180 - bearing))), done)
  }
  /** World bearing of a body's flow. */
  const flowBearing = (flowDir: number, objYaw: number) => {
    const w = rad(flowDir) - objYaw
    return norm(deg(Math.atan2(Math.cos(w), -Math.sin(w))))
  }
  function setFlowBearing(bearing: number, done = true) {
    const s = info.single
    if (!s) return
    const w = Math.atan2(-Math.cos(rad(bearing)), Math.sin(rad(bearing)))
    const value = Math.round(norm(deg(w + s.yaw)) * 100) / 100
    live('Change flow direction', () => editor.session.setProp(s.id, 'flow_dir', value), done)
  }
  function setFlowSpeed(speed: number, done: boolean) {
    const s = info.single
    if (s) live('Change flow', () => editor.session.setProp(s.id, 'flow_speed', speed), done)
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
          <label><span class="axis" style:color={AXIS_COLORS[a]}>{a.toUpperCase()}</span><input class="input" type="number" step="0.25" value={fmt(s[a])} aria-label="Position {a.toUpperCase()}"
            onfocus={() => editor.axes.show(s.id, a)} onblur={() => editor.axes.hide()}
            onchange={commit((v) => { setAxis(a, v); editor.axes.refresh() })} onkeydown={enter} /></label>
        {/each}
      </div>
    </div>
    <div class="field"><span class="label">Facing</span>
      <DirectionDial label="Facing" value={facing(s.deg)} {viewYaw} onchange={(b) => setFacing(b)}
        onpreview={(b) => setFacing(b, false)} oncancel={() => editor.endPreview(false)} />
    </div>
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
      {@const speed = s.flowSpeed}
      <div class="field"><span class="label">Flow</span>
        <div class="slider">
          <input type="range" min="0" max="3" step="0.1" value={speed} aria-label="Flow speed"
            oninput={(e) => setFlowSpeed(Number((e.currentTarget as HTMLInputElement).value), false)}
            onchange={(e) => setFlowSpeed(Number((e.currentTarget as HTMLInputElement).value), true)} />
          <span class="val"><span class="readout">{speed > 0 ? `${speed.toFixed(1)} m/s` : 'Still'}</span></span>
        </div>
      </div>
      {#if speed > 0}
        <div class="field sub"><span class="label">Direction</span>
          <DirectionDial label="Flow direction" value={flowBearing(s.flowDir, s.yaw)} {viewYaw} onchange={(b) => setFlowBearing(b)}
            onpreview={(b) => setFlowBearing(b, false)} oncancel={() => editor.endPreview(false)} />
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <p class="empty">{info.count} objects selected</p>
{/if}

<style>
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .axis { font-weight: 700; }
  .readout { flex: 1; text-align: right; font-variant-numeric: tabular-nums; }

</style>
