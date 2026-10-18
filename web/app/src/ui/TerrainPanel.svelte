<script lang="ts">
  // Terrain mode's left panel, from the registry's sculpt and paint tools: saved terrain tools,
  // Sculpt (the sculpt tool's shapes in one row), Paint (each material swatch picks up the paint
  // tool) and Brush (the range parameters of the terrain tool in hand, or the last one used, and
  // "Save brush"). Picking the tool already in hand again puts it down; the panel stays.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged, type ParamTool } from '../editor/tool-params'
  import { inHand, pickUp, putDown, TOOLS } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import { desktop } from '../platform'
  import Icon from './Icon.svelte'
  import ParamControl from './ParamControl.svelte'
  import SavedTools from './SavedTools.svelte'
  import { saveTool } from './saved-tools'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
    /** The saved tool matching the one in hand. */
    active: string | null
    onuse: (id: string) => void
  }
  let { editor, active, onuse }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const now = $derived.by(() => {
    rev
    const hand = inHand(editor)
    return { hand: hand === 'sculpt' || hand === 'paint' ? hand : null, op: params.sculpt.op, material: params.paint.material }
  })
  /** Whose brush settings the Brush section shows. */
  const brushTool = $derived<ParamTool>(now.hand ?? ui.terrainTool)
  const shapes = TOOLS.sculpt.params.find((p) => p.key === 'op')!.options!

  function sculpt(op: string) {
    if (now.hand === 'sculpt' && now.op === op) putDown(editor)
    else pickUp(editor, 'sculpt', { op: op as never })
  }

  function paint(material: number) {
    if (now.hand === 'paint' && now.material === material) putDown(editor)
    else pickUp(editor, 'paint', { material })
  }

  // Cmd/Ctrl+digit switches browser tabs, so the browser build saves with Alt.
  const saveKey = desktop ? (navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+') : 'Alt+'
</script>

<div class="panel-body">
  <SavedTools mode="terrain" {active} library={editor.library} {onuse} />

  <section>
    <h3>Sculpt</h3>
    <div class="sculpt">
      {#each shapes as s (s.value)}
        {@const on = now.hand === 'sculpt' && now.op === s.value}
        <button class="tile" class:on aria-pressed={on} onclick={() => sculpt(String(s.value))}>
          <Icon name={s.icon ?? ''} size={20} /><span>{s.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Paint</h3>
    <div class="materials">
      {#each PALETTE as m, i (m.name)}
        {@const on = now.hand === 'paint' && now.material === i}
        <button class="material" class:on aria-pressed={on} title="Paint {m.name}" onclick={() => paint(i)}>
          <span class="swatch" style:background={m.color}></span><span>{m.name}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Brush · {TOOLS[brushTool].label}</h3>
    {#each TOOLS[brushTool].params.filter((p) => p.kind === 'range') as def (`${brushTool}:${def.key}`)}
      <ParamControl tool={brushTool} {def} library={editor.library} />
    {/each}
    <button class="save" disabled={!now.hand} title={now.hand ? `Save this brush (${saveKey}1–9 saves it on a number key)` : 'Pick a tool first'}
      onclick={() => saveTool(editor)}>
      <Icon name="plus" size={14} /> Save brush <span class="hint">{saveKey}1–9</span>
    </button>
  </section>
</div>

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; flex: 1; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0 2px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .on { background: rgba(242, 193, 78, 0.16) !important; color: var(--accent) !important; border-color: rgba(242, 193, 78, 0.45) !important; }
  .sculpt { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; font-size: 11.5px; min-width: 0; }
  .materials { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 4px; }
  .material { display: flex; align-items: center; gap: 8px; padding: 5px 6px; text-align: left; font-size: 12px; }
  .swatch { width: 24px; height: 24px; border-radius: 6px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
  .save { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; }
  .save .hint { color: var(--muted); font-size: 11px; }
</style>
