<script lang="ts">
  // Water mode's catalogue: the liquid to draw (picking one picks up Draw with it). Draw / Erase
  // and their settings are in the tools container; a body's liquid is changed in Selection.
  // Bodies never overlap: see editor/water-shapes.ts.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp } from '../editor/tools'
  import { LIQUIDS, type LiquidDef } from '../world/liquids'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  let rev = $state(0)
  const offs = [editor.toolChanged.connect(() => rev++), paramsChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const now = $derived.by(() => {
    rev
    return { erasing: inHand(editor) === 'waterErase', liquid: params.water.liquid }
  })

  const swatch = (l: LiquidDef) => `linear-gradient(135deg, ${l.shallow} 0%, ${l.shallow} 45%, ${l.deep} 100%)`
</script>

<div class="panel-body">
  <section class="section">
    <h3 class="heading">Liquid</h3>
    <div class="choices">
      {#each LIQUIDS as l (l.id)}
        {@const on = now.liquid === l.id && !now.erasing}
        <button class="choice" class:on aria-pressed={on} onclick={() => pickUp(editor, 'water', { liquid: l.id })}>
          <span class="swatch lg" class:glow={l.glow > 0} style:background={swatch(l)} style:--glow={l.shallow}></span><span>{l.name}</span>
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  .swatch.glow { box-shadow: 0 0 8px var(--glow), inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
</style>
