<script lang="ts">
  // A saved tool's picture: the sculpt shape or building piece icon, the paint material's
  // swatch, the prop's thumbnail, or the tool's own icon.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import { TOOLS } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import Icon from './Icon.svelte'
  import { thumbUrls, type SavedTool } from './ui-state.svelte'

  interface Props {
    tool: Pick<SavedTool, 'tool' | 'params'>
    size?: number
    library?: Library | null
    thumbnails?: Thumbnails | null
  }
  let { tool, size = 16, library = null, thumbnails = null }: Props = $props()

  const p = $derived(tool.params)
  const prop = $derived(tool.tool === 'place' ? library?.props.get(String(p.prop)) : undefined)
  const thumb = $derived(prop ? (thumbUrls[prop.id] ?? thumbnails?.get(prop) ?? null) : null)
  /** The icon of the chosen option (sculpt shape, building piece), else the tool's. */
  const icon = $derived.by(() => {
    for (const def of TOOLS[tool.tool].params) {
      const opt = def.options?.find((o) => o.value === p[def.key])
      if (opt?.icon) return opt.icon
    }
    return TOOLS[tool.tool].icon
  })
</script>

{#if tool.tool === 'paint'}
  <span class="swatch" style:width="{size}px" style:height="{size}px" style:background={PALETTE[Number(p.material)]?.color}></span>
{:else if thumb}
  <img src={thumb} alt="" width={size + 6} height={size + 6} />
{:else}
  <Icon name={icon} {size} />
{/if}

<style>
  .swatch { display: block; flex: none; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }
  img { display: block; flex: none; image-rendering: pixelated; }
</style>
