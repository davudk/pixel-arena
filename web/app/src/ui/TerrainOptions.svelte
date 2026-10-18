<script lang="ts">
  // Terrain brush options, one row above the bottom bar: mode, then Size and Strength buttons
  // that open a popover (presets and a slider), and the material swatches when painting. Reads
  // and writes the shared terrainSettings, which the tool's [ / ] keys also change.
  import { onDestroy } from 'svelte'
  import { terrainSettings, type TerrainMode } from '../editor/terrain-tool'
  import { PALETTE } from '../render/terrain-shading'
  import Popover from './Popover.svelte'

  const MODES: TerrainMode[] = ['raise', 'lower', 'smooth', 'flatten', 'paint']
  const SIZES = [1, 2, 4, 8, 16, 32]
  const STRENGTHS = [0.1, 0.25, 0.5, 0.75, 1]
  let mode = $state(terrainSettings.mode)
  let radius = $state(terrainSettings.radius)
  let strength = $state(terrainSettings.strength)
  let material = $state(terrainSettings.material)
  let open: 'size' | 'strength' | null = $state(null)
  let sizeButton: HTMLButtonElement = $state()!
  let strengthButton: HTMLButtonElement = $state()!

  const off = terrainSettings.changed.connect(() => {
    mode = terrainSettings.mode
    radius = terrainSettings.radius
    strength = terrainSettings.strength
    material = terrainSettings.material
  })
  onDestroy(off)

  $effect(() => {
    terrainSettings.mode = mode
    terrainSettings.radius = radius
    terrainSettings.strength = strength
    terrainSettings.material = material
  })

  const meters = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)} m`
  const percent = (s: number) => `${Math.round(s * 100)}%`
</script>

<div class="options">
  <div class="row">
    <div class="modes" role="group" aria-label="Brush mode">
      {#each MODES as m (m)}
        <button class:on={mode === m} onclick={() => (mode = m)}>{m}</button>
      {/each}
    </div>
    <button class="value" class:open={open === 'size'} bind:this={sizeButton} title="Brush size ([ and ])"
      onclick={() => (open = open === 'size' ? null : 'size')}><span>Size</span>{meters(radius)}</button>
    <button class="value" class:open={open === 'strength'} bind:this={strengthButton} title="Brush strength (Shift+[ and Shift+])"
      onclick={() => (open = open === 'strength' ? null : 'strength')}><span>Strength</span>{percent(strength)}</button>
  </div>
  {#if mode === 'paint'}
    <div class="swatches">
      {#each PALETTE as m, i (m.name)}
        <button class:on={material === i} style:background={m.color} title={m.name} aria-label={m.name} onclick={() => (material = i)}></button>
      {/each}
    </div>
  {/if}
</div>

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
  .options {
    max-width: 100%; padding: 6px; border-radius: 12px; pointer-events: auto;
    background: var(--panel); border: 1px solid var(--line); backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; gap: 6px;
  }
  .row { display: flex; align-items: center; gap: 6px; }
  .modes { display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: #15171c; }
  .modes button { padding: 5px 10px; border-color: transparent; background: transparent; text-transform: capitalize; }
  .modes button.on { background: #30353f; color: var(--accent); }
  .value { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .value span { color: var(--muted); font-size: 11.5px; }
  .value.open { border-color: rgba(242, 193, 78, 0.5); }
  .swatches { display: flex; gap: 6px; padding: 0 2px 2px; }
  .swatches button { width: 26px; height: 26px; padding: 0; border-radius: 7px; border: 2px solid rgba(0, 0, 0, 0.35); }
  .swatches button.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(242, 193, 78, 0.35); }
  .pop { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .presets { display: flex; gap: 4px; }
  .presets button { flex: 1; padding: 5px 0; font-size: 12px; font-variant-numeric: tabular-nums; }
  .presets button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.4); }
  .pop label { display: flex; align-items: center; gap: 8px; }
  .pop input { flex: 1; accent-color: var(--accent); }
  .pop span { width: 44px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
