<script lang="ts">
  // A tool's settings as rows, in registry order (tools.ts), for the tools container. Choices
  // made from the mode's catalogue (prop, material, kit, and choices without `detail`) are left
  // out; settings of another variant (`hide`) and ones under a switch that is off (`parent`)
  // are hidden; the rest that don't apply show disabled with the reason.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { paramsChanged, type ParamTool } from '../editor/tool-params'
  import { applies, TOOLS } from '../editor/tools'
  import ParamControl from './ParamControl.svelte'

  interface Props {
    editor: Editor
    tool: ParamTool
  }
  let { editor, tool }: Props = $props()

  let rev = $state(0)
  const off = paramsChanged.connect(() => rev++)
  onDestroy(off)

  const CATALOGUE = new Set(['material', 'prop', 'kit'])
  const defs = $derived.by(() => {
    rev
    return TOOLS[tool].params.filter((p) => {
      if (CATALOGUE.has(p.kind) || (p.kind === 'choice' && !p.detail)) return false
      return !((p.hide || p.parent) && !applies(p, tool, editor.library))
    })
  })
</script>

{#each defs as def (`${tool}:${def.key}`)}<ParamControl {editor} {tool} {def} />{/each}
