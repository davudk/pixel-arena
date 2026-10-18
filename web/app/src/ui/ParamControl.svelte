<script lang="ts">
  // One tool setting as a row (label column + one control), drawn from its definition in the
  // registry (tools.ts): range → slider with an editable value (snap marks from `presets`),
  // toggle → switch, stepper → − value +, choice with `detail` → segmented control. Disabled,
  // with the reason as text, when it doesn't apply for a reason elsewhere (ToolSettings hides
  // the ones that belong to another variant or to a switch that is off).
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged, setParams, type ParamTool } from '../editor/tool-params'
  import { applies, inHand, pickUp, TOOLS, type ParamDef } from '../editor/tools'
  import Icon from './Icon.svelte'

  interface Props {
    editor: Editor
    tool: ParamTool
    def: ParamDef
  }
  let { editor, tool, def }: Props = $props()

  let rev = $state(0)
  const off = paramsChanged.connect(() => rev++)
  onDestroy(off)

  const value = $derived.by(() => {
    rev
    return (params[tool] as unknown as Record<string, unknown>)[def.key]
  })
  const on = $derived.by(() => {
    rev
    return applies(def, tool, editor.library)
  })
  /** Settings that pick the implementation (water's shape) re-create the tool in hand. */
  function set(v: unknown) {
    const patch = { [def.key]: v } as never
    if (TOOLS[tool].recreateOn?.includes(def.key) && inHand(editor) === tool) pickUp(editor, tool, patch)
    else setParams(tool, patch)
  }
  const scale = def.scale ?? 1
  const shown = (v: number) => String(Number((v * scale).toFixed(2)))
  const listId = `ticks-${tool}-${def.key}`

  function typed(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const v = Number(el.value) / scale
    if (Number.isFinite(v)) set(Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, v)))
    el.value = shown(Number(value))
  }
</script>

<div class="field" class:sub={!!def.parent} class:off={!on}>
  <span class="label" title={def.label}>{def.label}</span>
  {#if !on}
    <span class="reason">{def.why ?? ''}</span>
  {:else if def.kind === 'range'}
    <div class="slider">
      <input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} aria-label={def.label}
        list={def.presets ? listId : undefined} oninput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
      {#if def.presets}
        <datalist id={listId}>{#each def.presets as p (p)}<option value={p}></option>{/each}</datalist>
      {/if}
      <span class="val">
        <input class="input" inputmode="decimal" value={shown(Number(value))} aria-label="{def.label} value"
          onchange={typed} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
        <span class="unit">{def.unit ?? ''}</span>
      </span>
    </div>
  {:else if def.kind === 'toggle'}
    <button class="switch" class:on={value === true} role="switch" aria-checked={value === true} aria-label={def.label} onclick={() => set(!value)}></button>
  {:else if def.kind === 'stepper'}
    <div class="stepper">
      <button class="icon" disabled={Number(value) <= (def.min ?? -Infinity)} aria-label="{def.label} down" onclick={() => set(Number(value) - (def.step ?? 1))}><Icon name="minus" /></button>
      <span class="num">{def.format ? def.format(Number(value)) : String(value)}</span>
      <button class="icon" disabled={Number(value) >= (def.max ?? Infinity)} aria-label="{def.label} up" onclick={() => set(Number(value) + (def.step ?? 1))}><Icon name="plus" /></button>
    </div>
  {:else if def.kind === 'choice'}
    <div class="seg" role="group" aria-label={def.label}>
      {#each def.options ?? [] as o (o.value)}
        <button class:on={value === o.value} aria-pressed={value === o.value} onclick={() => set(o.value)}>
          {#if o.icon}<Icon name={o.icon} size={14} />{/if}{o.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .stepper { display: flex; align-items: center; gap: 4px; }
  .stepper .num { flex: 1; text-align: center; font-variant-numeric: tabular-nums; }
</style>
