<script lang="ts">
  // The tools container, left of the map above the catalogue: what you're holding and how.
  // Top to bottom: the mode's tool switch (Sculpt / Paint, Draw / Erase, Build / Erase), the
  // current-tool card, that tool's settings (the tool in hand, else the one the switch shows, so
  // it can be set up before picking it up), and the mode's saved tools in one scrolling row.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import type { Thumbnails } from '../library/thumbs'
  import { params, paramsChanged, type ParamTool } from '../editor/tool-params'
  import { inHand, MODE_TOOLS, pickUp, TOOLS, type Mode } from '../editor/tools'
  import CurrentTool from './CurrentTool.svelte'
  import Icon from './Icon.svelte'
  import SavedTools from './SavedTools.svelte'
  import ToolSettings from './ToolSettings.svelte'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
    mode: Mode
    thumbnails: Thumbnails | null
    active: string | null
    onsave: () => void
    onclear: () => void
    onuse: (id: string) => void
  }
  let { editor, mode, thumbnails, active, onsave, onclear, onuse }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  interface Verb { id: string; label: string; icon: string; tool: ParamTool; patch?: Record<string, unknown>; matches?: () => boolean }
  /** Each mode's tools, as one switch at the top (none for a mode with a single tool). */
  const VERBS: Partial<Record<Mode, Verb[]>> = {
    terrain: [
      { id: 'sculpt', label: 'Sculpt', icon: 'raise', tool: 'sculpt' },
      { id: 'paint', label: 'Paint', icon: 'brush', tool: 'paint' },
    ],
    water: [
      { id: 'water', label: 'Draw', icon: 'droplet', tool: 'water' },
      { id: 'waterErase', label: 'Erase', icon: 'eraser', tool: 'waterErase' },
    ],
    build: [
      { id: 'build', label: 'Build', icon: 'building', tool: 'build', matches: () => params.build.piece !== 'erase', patch: { piece: ui.buildPiece } },
      { id: 'buildErase', label: 'Erase', icon: 'eraser', tool: 'build', matches: () => params.build.piece === 'erase', patch: { piece: 'erase' } },
      { id: 'premade', label: 'Premade', icon: 'house', tool: 'premade' },
    ],
  }
  const verbs = $derived(VERBS[mode] ?? [])

  /** The mode's tool the settings belong to: in hand, else the last one used. */
  const current = $derived.by(() => {
    rev
    const hand = inHand(editor)
    const tool: ParamTool = hand && MODE_TOOLS[mode].includes(hand) ? hand
      : mode === 'terrain' ? ui.terrainTool : mode === 'water' ? ui.waterTool : mode === 'build' ? ui.buildTool : (MODE_TOOLS[mode][0] as ParamTool)
    const verb = verbs.find((v) => v.tool === tool && (v.matches?.() ?? true))?.id ?? null
    return { tool, verb, inHand: hand === tool }
  })

  function pick(v: Verb) {
    const patch = v.id === 'build' ? { piece: ui.buildPiece } : (v.patch ?? {})
    pickUp(editor, v.tool, patch as never)
  }
</script>

{#if verbs.length}
  <div class="seg verbs" role="group" aria-label="Tool">
    {#each verbs as v (v.id)}
      <button class:on={current.verb === v.id} aria-pressed={current.verb === v.id} onclick={() => pick(v)}><Icon name={v.icon} size={14} />{v.label}</button>
    {/each}
  </div>
{/if}
<CurrentTool {editor} {thumbnails} {active} {onsave} {onclear}
  fallback={mode === 'select' ? null : { tool: current.tool, label: TOOLS[current.tool].label.toLowerCase() }}
  onpickup={() => {
    const v = verbs.find((x) => x.id === current.verb)
    if (v) pick(v)
    else pickUp(editor, current.tool)
  }} />
<div class="settings"><ToolSettings {editor} tool={current.tool} /></div>
<SavedTools {mode} {active} library={editor.library} {thumbnails} {onuse} row />

<style>
  .verbs button { min-height: 26px; }
  .settings { display: flex; flex-direction: column; gap: 6px; }
  .settings:empty { display: none; }
</style>
