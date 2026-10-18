<script lang="ts">
  // Right-click menu for a saved brush (panel chip or hotbar card): rename, move to another
  // number slot, delete.
  import Popover from './Popover.svelte'
  import { brushLabel, deleteBrush, moveBrush, renameBrush, SLOTS } from './brushes'
  import { ui } from './ui-state.svelte'

  interface Props {
    slot: number
    anchor: HTMLElement
    placement?: 'below' | 'above'
    onclose: () => void
  }
  let { slot, anchor, placement = 'below', onclose }: Props = $props()

  const brush = $derived(ui.brushes.find((b) => b.slot === slot))
  let name = $state(ui.brushes.find((b) => b.slot === slot)?.name ?? '')
</script>

{#if brush}
  <Popover {anchor} {placement} width={230} {onclose}>
    <div class="menu">
      <label class="field">Name
        <input placeholder={brushLabel({ ...brush, name: '' })} bind:value={name}
          onchange={() => renameBrush(slot, name)} onkeydown={(e) => e.key === 'Enter' && (renameBrush(slot, name), onclose())} />
      </label>
      <div class="field">Key
        <div class="slots">
          {#each Array.from({ length: SLOTS }, (_, i) => i + 1) as s (s)}
            <button class:on={s === slot} class:used={s !== slot && ui.brushes.some((b) => b.slot === s)}
              title={s === slot ? 'Current key' : ui.brushes.some((b) => b.slot === s) ? 'Swap with the brush on this key' : ''}
              onclick={() => { moveBrush(slot, s); onclose() }}>{s}</button>
          {/each}
        </div>
      </div>
      <button class="delete" onclick={() => { deleteBrush(slot); onclose() }}>Delete brush</button>
    </div>
  </Popover>
{/if}

<style>
  .menu { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 5px; color: var(--muted); font-size: 11.5px; }
  .field input { padding: 6px 8px; border-radius: 7px; border: 1px solid var(--line); background: #0f1115; color: var(--text); font: inherit; font-size: 12.5px; outline: none; }
  .field input:focus { border-color: var(--accent); }
  .slots { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; }
  .slots button { padding: 4px 0; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .slots button.used { color: var(--muted); }
  .slots button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
  .delete { color: #ff8a7a; }
</style>
