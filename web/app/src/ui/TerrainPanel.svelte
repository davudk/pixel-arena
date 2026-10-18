<script lang="ts">
  // Terrain mode's catalogue: what the current terrain tool (in hand, else the last one used;
  // switched in the tools container) applies. Sculpt: the effect (Raise, Lower, Smooth,
  // Flatten). Paint: the material. Picking one picks the tool up with it.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp, TOOLS } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import Icon from './Icon.svelte'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const now = $derived.by(() => {
    rev
    const hand = inHand(editor)
    const tool = hand === 'sculpt' || hand === 'paint' ? hand : ui.terrainTool
    return { tool, op: params.sculpt.op, material: params.paint.material }
  })
  const effects = TOOLS.sculpt.params.find((p) => p.key === 'op')!.options!
</script>

<div class="panel-body">
  {#if now.tool === 'sculpt'}
    <section class="section">
      <h3 class="heading">Effect</h3>
      <div class="tiles">
        {#each effects as s (s.value)}
          {@const on = now.op === s.value}
          <button class="tile" class:on aria-pressed={on} onclick={() => pickUp(editor, 'sculpt', { op: s.value as never })}>
            <Icon name={s.icon ?? ''} size={20} /><span>{s.label}</span>
          </button>
        {/each}
      </div>
    </section>
  {:else}
    <section class="section">
      <h3 class="heading">Material</h3>
      <div class="choices">
        {#each PALETTE as m, i (m.name)}
          {@const on = now.material === i}
          <button class="choice" class:on aria-pressed={on} onclick={() => pickUp(editor, 'paint', { material: i })}>
            <span class="swatch lg" style:background={m.color}></span><span>{m.name}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>
