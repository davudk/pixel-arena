<script lang="ts">
  // Terrain mode's catalogue: what the current terrain tool (in hand, else the last one used;
  // switched in the tools container) applies. Sculpt: the effect (Raise, Lower, Smooth,
  // Flatten). Paint: the materials by group, each showing its texture. Picking one picks the
  // tool up with it.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp, TOOLS } from '../editor/tools'
  import { PALETTE, terrainMaterialsChanged } from '../render/terrain-shading'
  import Icon from './Icon.svelte'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++), terrainMaterialsChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const now = $derived.by(() => {
    rev
    const hand = inHand(editor)
    const tool = hand === 'sculpt' || hand === 'paint' ? hand : ui.terrainTool
    return { tool, op: params.sculpt.op, material: params.paint.material }
  })
  const effects = TOOLS.sculpt.params.find((p) => p.key === 'op')!.options!
  /** Materials by group (Ground, Paving, Tiles, Brick, Wood), in slot order within each. */
  const GROUP_ORDER = ['Ground', 'Paving', 'Tiles', 'Brick', 'Wood']
  const groups = $derived.by(() => {
    rev
    const out = new Map<string, { m: (typeof PALETTE)[number]; slot: number }[]>()
    PALETTE.forEach((m, slot) => {
      if (!out.has(m.group)) out.set(m.group, [])
      out.get(m.group)!.push({ m, slot })
    })
    return [...out].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 99) % 99 - (GROUP_ORDER.indexOf(b[0]) + 99) % 99)
  })
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
    {#each groups as [group, items] (group)}
      <section class="section">
        <h3 class="heading">{group}</h3>
        <div class="choices">
          {#each items as { m, slot } (slot)}
            {@const on = now.material === slot}
            <button class="choice" class:on aria-pressed={on} title={m.name} onclick={() => pickUp(editor, 'paint', { material: slot })}>
              <span class="swatch lg tex" style:background-color={m.color} style:background-image={m.texture ? `url("${m.texture}")` : null}></span><span>{m.name}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  /* A patch of the material's texture, crisp. */
  .tex { background-size: 48px; background-position: center; image-rendering: pixelated; }
</style>
