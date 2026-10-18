<script lang="ts">
  // A saved brush's picture: the sculpt icon, or the paint material's swatch.
  import { PALETTE } from '../render/terrain-shading'
  import Icon from './Icon.svelte'
  import type { SavedBrush } from './ui-state.svelte'

  let { brush, size = 16 }: { brush: SavedBrush; size?: number } = $props()
  const ICONS: Record<string, string> = { raise: 'raise', lower: 'lower', smooth: 'smooth', flatten: 'flatten' }
</script>

{#if brush.mode === 'paint'}
  <span class="swatch" style:width="{size}px" style:height="{size}px" style:background={PALETTE[brush.material]?.color}></span>
{:else}
  <Icon name={ICONS[brush.mode]} {size} />
{/if}

<style>
  .swatch { display: block; flex: none; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
</style>
