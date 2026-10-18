<script lang="ts">
  // Terrain mode's left panel: the brush (raise, lower, smooth, flatten, paint) as tiles, then
  // the paint materials as large named swatches. Picking a material switches to painting.
  import { onDestroy } from 'svelte'
  import { terrainSettings, type TerrainMode } from '../editor/terrain-tool'
  import { PALETTE } from '../render/terrain-shading'
  import Icon from './Icon.svelte'

  const BRUSHES: { mode: TerrainMode; label: string; icon: string }[] = [
    { mode: 'raise', label: 'Raise', icon: 'raise' },
    { mode: 'lower', label: 'Lower', icon: 'lower' },
    { mode: 'smooth', label: 'Smooth', icon: 'smooth' },
    { mode: 'flatten', label: 'Flatten', icon: 'flatten' },
    { mode: 'paint', label: 'Paint', icon: 'brush' },
  ]
  let mode = $state(terrainSettings.mode)
  let material = $state(terrainSettings.material)

  const off = terrainSettings.changed.connect(() => {
    mode = terrainSettings.mode
    material = terrainSettings.material
  })
  onDestroy(off)

  $effect(() => {
    terrainSettings.mode = mode
    terrainSettings.material = material
  })
</script>

<div class="panel-body">
  <h3>Brush</h3>
  <div class="tiles">
    {#each BRUSHES as b (b.mode)}
      <button class="tile" class:on={mode === b.mode} onclick={() => (mode = b.mode)}><Icon name={b.icon} size={22} /><span>{b.label}</span></button>
    {/each}
  </div>
  <h3>Materials</h3>
  <div class="materials" class:dim={mode !== 'paint'}>
    {#each PALETTE as m, i (m.name)}
      <button class="material" class:on={mode === 'paint' && material === i} onclick={() => { material = i; mode = 'paint' }}>
        <span class="swatch" style:background={m.color}></span><span>{m.name}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; }
  h3 { margin: 4px 2px 0; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; font-size: 12px; }
  .tile.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
  .materials { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
  .materials.dim .material { opacity: 0.75; }
  .material { display: flex; align-items: center; gap: 8px; padding: 6px; text-align: left; font-size: 12px; }
  .material.on { border-color: var(--accent); background: rgba(242, 193, 78, 0.12); opacity: 1; }
  .swatch { width: 30px; height: 30px; border-radius: 7px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
</style>
