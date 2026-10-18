<script lang="ts">
  // A tool's settings as controls, for the mode panels' settings sections (the current-tool card
  // only summarizes them). Shows the given tool's parameters, optionally only `keys`, leaving out
  // choices made from the panel's catalogue: on/off settings as a row of toggle buttons, then
  // sliders and steppers. Panels pass the tool in hand, or the one last used in their mode so it
  // can be set up before picking it.
  import type { Library } from '../library/library'
  import { onDestroy } from 'svelte'
  import { paramsChanged, type ParamTool } from '../editor/tool-params'
  import { applies, TOOLS } from '../editor/tools'
  import ParamControl from './ParamControl.svelte'

  interface Props {
    library: Library
    tool: ParamTool
    keys?: string[]
  }
  let { library, tool, keys }: Props = $props()

  let rev = $state(0)
  const off = paramsChanged.connect(() => rev++)
  onDestroy(off)

  const CATALOGUE = new Set(['choice', 'material', 'prop', 'kit'])
  // Settings of another variant (`hide`, e.g. brush size while drawing a polygon) are left out;
  // others that don't apply show disabled.
  const defs = $derived.by(() => {
    rev
    return TOOLS[tool].params.filter((p) => !CATALOGUE.has(p.kind) && (!keys || keys.includes(p.key)) && !(p.hide && !applies(p, tool, library)))
  })
  const toggles = $derived(defs.filter((p) => p.kind === 'toggle'))
  const controls = $derived(defs.filter((p) => p.kind !== 'toggle'))
</script>

{#if toggles.length}
  <div class="toggles">
    {#each toggles as def (`${tool}:${def.key}`)}<ParamControl {tool} {def} {library} />{/each}
  </div>
{/if}
{#each controls as def (`${tool}:${def.key}`)}<ParamControl {tool} {def} {library} />{/each}

<style>
  .toggles { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
