<script lang="ts">
  // Build mode's catalogue: the piece (structure: floor, wall, stairs; openings: door, window,
  // doorway) and the kit for new buildings (picking either picks up
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
  const options = TOOLS.build.params.find((p) => p.key === 'piece')!.options!
  /** Pieces in two rows: what a building is made of, and what goes in its walls. */
  const SECTIONS: [string, string[]][] = [['Structure', ['foundation', 'wall', 'stairs']], ['Openings', ['door', 'window', 'doorway']]]
  const sections = SECTIONS.map(([title, ids]) => [title, ids.map((id) => options.find((o) => o.value === id)!)] as const)

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const view = $derived.by(() => {
    rev
    const kit = editor.library.kits.get(params.build.kit)
    return { piece: params.build.piece, kit: params.build.kit, erasing: inHand(editor) === 'build' && params.build.piece === 'erase', interiors: kit?.style !== 'block' && !!kit?.pieces.stairs?.length }
  })
</script>

<div class="panel-body">
  {#each sections as [title, items] (title)}
    <section class="section">
      <h3 class="heading">{title}</h3>
      <div class="tiles">
        <!-- Stairs only for kits that have them (hidden, as the kit is chosen right here). -->
        {#each items.filter((p) => p.value !== 'stairs' || view.interiors) as p (p.value)}
          {@const on = view.piece === p.value}
          <button class="tile" class:on aria-pressed={on}
            onclick={() => pickUp(editor, 'build', { piece: p.value as never })}><Icon name={p.icon ?? ''} size={20} /><span>{p.label}</span></button>
        {/each}
      </div>
    </section>
  {/each}

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
