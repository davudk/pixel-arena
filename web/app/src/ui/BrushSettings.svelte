<script lang="ts">
  // Terrain brush size and strength for the bottom bar: buttons that open a popover above them
  // with presets and a slider. Reads and writes terrainSettings, which the tool's [ / ] keys
  // also change.
  import { onDestroy } from 'svelte'
  import { terrainSettings } from '../editor/terrain-tool'
  import Popover from './Popover.svelte'

  const SIZES = [1, 2, 4, 8, 16, 32]
  const STRENGTHS = [0.1, 0.25, 0.5, 0.75, 1]
  let radius = $state(terrainSettings.radius)
  let strength = $state(terrainSettings.strength)
  let open: 'size' | 'strength' | null = $state(null)
  let sizeButton: HTMLButtonElement = $state()!
  let strengthButton: HTMLButtonElement = $state()!

  const off = terrainSettings.changed.connect(() => {
    radius = terrainSettings.radius
    strength = terrainSettings.strength
  })
  onDestroy(off)

  $effect(() => {
    terrainSettings.radius = radius
    terrainSettings.strength = strength
  })

  const meters = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)} m`
  const percent = (s: number) => `${Math.round(s * 100)}%`
</script>

<button class="value" class:open={open === 'size'} bind:this={sizeButton} title="Brush size ([ and ])"
  onclick={() => (open = open === 'size' ? null : 'size')}><span>Size</span>{meters(radius)}</button>
<button class="value" class:open={open === 'strength'} bind:this={strengthButton} title="Brush strength (Shift+[ and Shift+])"
  onclick={() => (open = open === 'strength' ? null : 'strength')}><span>Strength</span>{percent(strength)}</button>

{#if open === 'size'}
  <Popover anchor={sizeButton} placement="above" width={250} onclose={() => (open = null)}>
    <div class="pop">
      <div class="presets">
        {#each SIZES as v (v)}<button class:on={radius === v} onclick={() => (radius = v)}>{v}</button>{/each}
      </div>
      <label><input type="range" min="1" max="32" step="0.5" bind:value={radius} /><span>{meters(radius)}</span></label>
    </div>
  </Popover>
{/if}

{#if open === 'strength'}
  <Popover anchor={strengthButton} placement="above" width={250} onclose={() => (open = null)}>
    <div class="pop">
      <div class="presets">
        {#each STRENGTHS as v (v)}<button class:on={Math.abs(strength - v) < 1e-6} onclick={() => (strength = v)}>{percent(v)}</button>{/each}
      </div>
      <label><input type="range" min="0.05" max="1" step="0.05" bind:value={strength} /><span>{percent(strength)}</span></label>
    </div>
  </Popover>
{/if}

<style>
  .value { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .value span { color: var(--muted); font-size: 11.5px; }
  .value.open { border-color: rgba(242, 193, 78, 0.5); }
  .pop { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .presets { display: flex; gap: 4px; }
  .presets button { flex: 1; padding: 5px 0; font-size: 12px; font-variant-numeric: tabular-nums; }
  .presets button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.4); }
  .pop label { display: flex; align-items: center; gap: 8px; }
  .pop input { flex: 1; accent-color: var(--accent); }
  .pop span { width: 44px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
