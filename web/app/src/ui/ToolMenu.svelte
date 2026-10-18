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
    <div class="menu">
      <label class="field">Name
        <input placeholder={describe(tool, library)} bind:value={name}
          onchange={() => rename(id, name)} onkeydown={(e) => e.key === 'Enter' && (rename(id, name), onclose())} />
      </label>
      <div class="field">Key
        <div class="slots">
          <button class="none" class:on={tool.slot === null} onclick={() => setSlot(id, null)}>None</button>
          {#each Array.from({ length: SLOTS }, (_, i) => i + 1) as s (s)}
            <button class:on={tool.slot === s} class:used={!!holder(s)}
              title={holder(s) ? `Takes the key from ${describe(holder(s)!, library)}` : ''}
              onclick={() => setSlot(id, s)}>{s}</button>
          {/each}
        </div>
      </div>
      <button class="delete" onclick={() => { remove(id); onclose() }}>Delete</button>
    </div>
  </Popover>
{/if}

<style>
  .menu { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 5px; color: var(--muted); font-size: 11.5px; }
  .field input { padding: 6px 8px; border-radius: 7px; border: 1px solid var(--line); background: #0f1115; color: var(--text); font: inherit; font-size: 12.5px; outline: none; }
  .field input:focus { border-color: var(--accent); }
  .slots { display: grid; grid-template-columns: 2.2fr repeat(9, 1fr); gap: 3px; }
  .slots button { padding: 4px 0; font-size: 11.5px; font-variant-numeric: tabular-nums; min-width: 0; }
  .slots button.used { color: var(--muted); }
  .slots button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
  .delete { color: #ff8a7a; }
</style>
