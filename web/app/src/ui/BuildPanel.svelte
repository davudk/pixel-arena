<script lang="ts">
  // Build mode's catalogue: the piece and the kit for new buildings (picking either picks up
  // Build with it). Build / Erase and the level are in the tools container; the kit and roof of
  // an existing building are in Selection.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged } from '../editor/tool-params'
  import { inHand, pickUp, TOOLS } from '../editor/tools'
  import Icon from './Icon.svelte'

  interface Props {
    editor: Editor
  }
  let { editor }: Props = $props()

  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))
  const pieces = TOOLS.build.params.find((p) => p.key === 'piece')!.options!.filter((p) => p.value !== 'erase')

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const view = $derived.by(() => {
    rev
    return { piece: params.build.piece, kit: params.build.kit, erasing: inHand(editor) === 'build' && params.build.piece === 'erase' }
  })
</script>

<div class="panel-body">
  <section class="section">
    <h3 class="heading">Piece</h3>
    <div class="tiles">
      {#each pieces as p (p.value)}
        {@const on = view.piece === p.value}
        <button class="tile" class:on aria-pressed={on} onclick={() => pickUp(editor, 'build', { piece: p.value as never })}><Icon name={p.icon ?? ''} size={20} /><span>{p.label}</span></button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h3 class="heading">Kit</h3>
    <div class="choices">
      {#each kits as k (k.id)}
        {@const on = view.kit === k.id && !view.erasing}
        <button class="choice" class:on aria-pressed={on} onclick={() => pickUp(editor, 'build', view.erasing ? { kit: k.id, piece: 'wall' } : { kit: k.id })}>
          <svg viewBox="0 0 48 40" aria-hidden="true">
            <path d="M4 20 L24 6 L44 20 Z" fill={k.colors.roof} />
            <rect x="9" y="20" width="30" height="13" fill={k.colors.gable} />
            <rect x="21" y="25" width="6" height="8" fill="rgba(0,0,0,0.35)" />
            <rect x="6" y="33" width="36" height="4" fill={k.colors.foundation} />
          </svg>
          <span>{k.name}</span>
        </button>
      {/each}
    </div>
  </section>
</div>
