<script lang="ts">
  // Right-click menu for a saved tool (panel or hotbar): name, number key (or none), delete.
  import type { Library } from '../library/library'
  import Popover from './Popover.svelte'
  import { describe, remove, rename, setSlot, SLOTS } from './saved-tools'
  import { ui } from './ui-state.svelte'

  interface Props {
    id: string
    anchor: HTMLElement
    library: Library | null
    placement?: 'below' | 'above'
    onclose: () => void
  }
  let { id, anchor, library, placement = 'below', onclose }: Props = $props()

  const tool = $derived(ui.tools.find((t) => t.id === id))
  let name = $state(ui.tools.find((t) => t.id === id)?.name ?? '')
  const holder = (s: number) => ui.tools.find((t) => t.slot === s && t.id !== id)
</script>

{#if tool}
  <Popover {anchor} {placement} width={250} {onclose}>
    <div class="pop">
      <label class="field"><span class="label">Name</span>
        <input class="input" placeholder={describe(tool, library)} bind:value={name}
          onchange={() => rename(id, name)} onkeydown={(e) => e.key === 'Enter' && (rename(id, name), onclose())} />
      </label>
      <div class="field stack"><span class="label">Key</span>
        <div class="slots">
          <button class="none" class:on={tool.slot === null} onclick={() => setSlot(id, null)}>None</button>
          {#each Array.from({ length: SLOTS }, (_, i) => i + 1) as s (s)}
            <button class:on={tool.slot === s} class:used={!!holder(s)}
              title={holder(s) ? `Takes the key from ${describe(holder(s)!, library)}` : ''}
              onclick={() => setSlot(id, s)}>{s}</button>
          {/each}
        </div>
      </div>
      <div class="action-bar"><button class="danger-text" onclick={() => { remove(id); onclose() }}>Remove from saved tools</button></div>
    </div>
  </Popover>
{/if}

<style>
  .slots { display: grid; grid-template-columns: 2.2fr repeat(9, 1fr); gap: 3px; }
  .slots button { padding: 4px 0; font-size: 11.5px; font-variant-numeric: tabular-nums; min-width: 0; }
  .slots button.used { color: var(--muted); }

</style>
