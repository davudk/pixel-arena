<script lang="ts">
  // One tool parameter, drawn from its definition in the registry (tools.ts): a slider with
  // presets (range), an on/off button (toggle) or − value + (stepper). Disabled, with the
  // reason as a tooltip, when it doesn't apply to the tool's current values.
  import { onDestroy } from 'svelte'
  import type { Library } from '../library/library'
  import { params, paramsChanged, setParams, type ParamTool } from '../editor/tool-params'
  import { applies, type ParamDef } from '../editor/tools'
  import Icon from './Icon.svelte'

  interface Props {
    tool: ParamTool
    def: ParamDef
    library: Library
  }
  let { tool, def, library }: Props = $props()

  let rev = $state(0)
  const off = paramsChanged.connect(() => rev++)
  onDestroy(off)

  const value = $derived.by(() => {
    rev
    return (params[tool] as unknown as Record<string, unknown>)[def.key]
  })
  const on = $derived.by(() => {
    rev
    return applies(def, tool, library)
  })
  const set = (v: unknown) => setParams(tool, { [def.key]: v } as never)
  const fmt = (v: number) => (def.format ? def.format(v) : String(v))
</script>

{#if def.kind === 'range'}
  <div class="range" class:off={!on} title={on ? '' : (def.why ?? '')}>
    <div class="field">
      <span class="label">{def.label}</span>
      <input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} disabled={!on} aria-label={def.label}
        oninput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
      <span class="val">{fmt(Number(value))}</span>
    </div>
    {#if def.presets}
      <div class="presets">
        {#each def.presets as p (p)}
          <button class:on={Math.abs(Number(value) - p) < 1e-6} disabled={!on} onclick={() => set(p)}>{fmt(p).replace(/ m$/, '')}</button>
        {/each}
      </div>
    {/if}
  </div>
{:else if def.kind === 'toggle'}
  <button class="toggle" class:on={on && value === true} aria-pressed={on && value === true} disabled={!on}
    title={on ? '' : (def.why ?? '')} onclick={() => set(!value)}>
    {#if def.icon}<Icon name={def.icon} />{/if}{def.label}
  </button>
{:else if def.kind === 'stepper'}
  <div class="stepper">
    <button class="icon" disabled={Number(value) <= (def.min ?? -Infinity)} aria-label="{def.label} down" onclick={() => set(Number(value) - (def.step ?? 1))}><Icon name="down" /></button>
    <span>{def.label} {fmt(Number(value))}</span>
    <button class="icon" disabled={Number(value) >= (def.max ?? Infinity)} aria-label="{def.label} up" onclick={() => set(Number(value) + (def.step ?? 1))}><Icon name="up" /></button>
  </div>
{/if}

<style>
  .range.off { opacity: 0.4; }
  /* Slider row uses the shared .field (64px label column); value readout at the end. */
  .field input { flex: 1; }
  .field .val { flex: none; width: 44px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
  .presets { display: flex; gap: 3px; margin: 4px 0 0 72px; }
  .presets button { flex: 1; padding: 3px 0; font-size: 11px; font-variant-numeric: tabular-nums; min-width: 0; }
  .stepper { display: flex; align-items: center; gap: 6px; }
  .stepper span { min-width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
</style>
