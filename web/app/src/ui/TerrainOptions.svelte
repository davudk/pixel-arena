<script lang="ts">
  // Terrain brush options: mode, size, strength and (for painting) the material swatches. Reads
  // and writes the shared terrainSettings, which the tool's [ / ] keys also change.
  import { onDestroy } from 'svelte'
  import { terrainSettings, type TerrainMode } from '../editor/terrain-tool'
  import { PALETTE } from '../render/terrain-shading'

  const MODES: TerrainMode[] = ['raise', 'lower', 'smooth', 'flatten', 'paint']
  let mode = $state(terrainSettings.mode)
  let radius = $state(terrainSettings.radius)
  let strength = $state(terrainSettings.strength)
  let material = $state(terrainSettings.material)

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
</script>

<div class="options">
  <div class="modes">
    {#each MODES as m (m)}
      <button class:on={mode === m} onclick={() => (mode = m)}>{m}</button>
    {/each}
  </div>
  <label>Size <input type="range" min="1" max="32" step="0.5" bind:value={radius} /> <span>{radius.toFixed(1)} m</span></label>
  <label>Strength <input type="range" min="0.05" max="1" step="0.05" bind:value={strength} /> <span>{Math.round(strength * 100)}%</span></label>
  {#if mode === 'paint'}
    <div class="swatches">
      {#each PALETTE as m, i (m.name)}
        <button class:on={material === i} style:background={m.color} title={m.name} aria-label={m.name} onclick={() => (material = i)}></button>
      {/each}
    </div>
  {/if}
  <p class="hint">Hold to apply · [ ] size · Shift+[ ] strength · Esc</p>
</div>

<style>
  .options {
    position: absolute; top: 64px; left: 12px; width: 340px; padding: 10px 12px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; gap: 8px;
  }
  .modes { display: flex; gap: 4px; }
  .modes button { flex: 1; padding: 5px 0; text-transform: capitalize; }
  .modes button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.4); }
  label { display: flex; align-items: center; gap: 8px; }
  label input { flex: 1; accent-color: var(--accent); }
  label span { width: 52px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .swatches { display: flex; gap: 6px; }
  .swatches button { width: 28px; height: 28px; padding: 0; border-radius: 7px; border: 2px solid rgba(0, 0, 0, 0.35); }
  .swatches button.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(242, 193, 78, 0.35); }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; }
</style>
