<script lang="ts">
  // Terrain mode's catalogue (under the current-tool card, which holds size and strength): saved
  // terrain tools, Sculpt (the sculpt tool's shapes) and Paint (each material swatch picks up the
  // paint tool). Picking the tool already in hand again puts it down.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp, putDown, TOOLS } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import Icon from './Icon.svelte'
  import SavedTools from './SavedTools.svelte'

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
  const shapes = TOOLS.sculpt.params.find((p) => p.key === 'op')!.options!

  function sculpt(op: string) {
    if (now.hand === 'sculpt' && now.op === op) putDown(editor)
    else pickUp(editor, 'sculpt', { op: op as never })
  }

  function paint(material: number) {
    if (now.hand === 'paint' && now.material === material) putDown(editor)
    else pickUp(editor, 'paint', { material })
  }
</script>

<div class="panel-body">
  <SavedTools mode="terrain" {active} library={editor.library} {onuse} />

  <section class="section">
    <h3 class="heading">Sculpt</h3>
    <div class="tiles four">
      {#each shapes as s (s.value)}
        {@const on = now.hand === 'sculpt' && now.op === s.value}
        <button class="tile" class:on aria-pressed={on} onclick={() => sculpt(String(s.value))}>
          <Icon name={s.icon ?? ''} size={20} /><span>{s.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h3 class="heading">Paint</h3>
    <div class="choices">
      {#each PALETTE as m, i (m.name)}
        {@const on = now.hand === 'paint' && now.material === i}
        <button class="choice" class:on aria-pressed={on} title="Paint {m.name}" onclick={() => paint(i)}>
          <span class="swatch lg" style:background={m.color}></span><span>{m.name}</span>
        </button>
      {/each}
    </div>
  </section>
</div>
