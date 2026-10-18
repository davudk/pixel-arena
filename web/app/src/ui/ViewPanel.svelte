<script lang="ts">
  // View settings panel: filter preset + per-option overrides, time of day, grid, building
  // cutaway. Values shown are the resolved ones; overridden options are highlighted. "Make map
  // defaults" writes the current look into the map (undoable); "Use map defaults" drops this
  // viewer's overrides.
  import { onDestroy } from 'svelte'
  import { OPTIONS, PALETTE_NAMES, PRESET_ORDER, type OptionKey } from '../render/filters'
  import type { ViewKey, ViewSettings } from '../render/view-settings'
  import { ui } from './ui-state.svelte'

  interface Props {
    settings: ViewSettings
    cutaway: number
    clock: string
    onmapdefaults: () => void
  }
  let { settings, cutaway = $bindable(), clock, onmapdefaults }: Props = $props()

  let rev = $state(0)
  let showOptions = $state(false)
  const off = settings.changed.connect(() => rev++)
  onDestroy(off)

  const v = $derived.by(() => {
    rev
    return {
      filter: settings.get('filter'), options: settings.filterOptions(), time: settings.get('time_of_day'),
      cycle: settings.get('time_mode') === 'cycle', dayMinutes: settings.get('day_length') / 60, grid: settings.get('grid'),
      overridden: new Set(Object.keys(settings.overrides)),
    }
  })

  type Slider = { key: OptionKey; label: string; min: number; max: number; step: number }
  const SLIDERS: Slider[] = [
    { key: 'pixel_size', label: 'Pixel size', min: 1, max: 8, step: 1 },
    { key: 'outline', label: 'Outline', min: 0, max: 1, step: 0.05 },
    { key: 'dither', label: 'Dither', min: 0, max: 1, step: 0.05 },
    { key: 'color_levels', label: 'Color levels', min: 2, max: 32, step: 1 },
    { key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.02 },
    { key: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.05 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
    { key: 'tint_amount', label: 'Tint amount', min: 0, max: 1, step: 0.05 },
    { key: 'oil', label: 'Oil paint', min: 0, max: 6, step: 1 },
    { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.05 },
    { key: 'grain', label: 'Grain', min: 0, max: 0.5, step: 0.01 },
    { key: 'scanlines', label: 'Scanlines', min: 0, max: 1, step: 0.05 },
  ]
  const set = (k: ViewKey, value: string | number | boolean) => settings.setOverride(k, value)
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
</script>

<div class="view">
  <label class:ov={v.overridden.has('filter')}>Filter
    <select value={v.filter} onchange={(e) => settings.chooseFilter((e.currentTarget as HTMLSelectElement).value)}>
      {#each PRESET_ORDER as p (p)}<option value={p}>{p}</option>{/each}
    </select>
  </label>
  <button class="link" onclick={() => (showOptions = !showOptions)}>{showOptions ? '▾' : '▸'} Filter options</button>
  {#if showOptions}
    <div class="options">
      {#each SLIDERS as s (s.key)}
        <label class:ov={v.overridden.has(s.key)}>{s.label}
          <input type="range" min={s.min} max={s.max} step={s.step} value={v.options[s.key]}
            oninput={(e) => set(s.key, Number((e.currentTarget as HTMLInputElement).value))} />
          <span>{fmt(Number(v.options[s.key]))}</span>
        </label>
      {/each}
      <label class:ov={v.overridden.has('palette')}>Palette
        <select value={v.options.palette} onchange={(e) => set('palette', (e.currentTarget as HTMLSelectElement).value)}>
          {#each PALETTE_NAMES as p (p)}<option value={p}>{p}</option>{/each}
        </select>
      </label>
      <label class:ov={v.overridden.has('tint')}>Tint <input type="color" value={v.options.tint} oninput={(e) => set('tint', (e.currentTarget as HTMLInputElement).value)} /></label>
      <label class:ov={v.overridden.has('outline_color')}>Outline color <input type="color" value={v.options.outline_color} oninput={(e) => set('outline_color', (e.currentTarget as HTMLInputElement).value)} /></label>
    </div>
  {/if}
  <label class:ov={v.overridden.has('grid')}><input type="checkbox" checked={v.grid} onchange={(e) => set('grid', (e.currentTarget as HTMLInputElement).checked)} /> Grid</label>
  <label class="time" class:ov={v.overridden.has('time_of_day')}>Time
    <input type="range" min="0" max="24" step="0.25" value={v.time} oninput={(e) => set('time_of_day', Number((e.currentTarget as HTMLInputElement).value))} />
    <span>{clock}</span>
  </label>
  <label class:ov={v.overridden.has('time_mode')}><input type="checkbox" checked={v.cycle} onchange={(e) => set('time_mode', (e.currentTarget as HTMLInputElement).checked ? 'cycle' : 'fixed')} /> Day/night cycle</label>
  {#if v.cycle}
    <label class:ov={v.overridden.has('day_length')}>Day length
      <input type="range" min="0.5" max="60" step="0.5" value={v.dayMinutes} oninput={(e) => set('day_length', Number((e.currentTarget as HTMLInputElement).value) * 60)} />
      <span>{v.dayMinutes} min</span>
    </label>
  {/if}
  <label>Building level
    <select bind:value={cutaway}>
      <option value={-1}>All</option>
      {#each [0, 1, 2, 3] as l (l)}<option value={l}>Up to {l}</option>{/each}
    </select>
  </label>
  <div class="defaults">
    <button onclick={onmapdefaults} title="Save the current look into this map">Make map defaults</button>
    <button onclick={() => settings.clearOverrides()} disabled={v.overridden.size === 0} title="Drop your own overrides">Use map defaults</button>
  </div>
  <label><input type="checkbox" bind:checked={ui.showStats} /> Performance stats</label>
</div>

<style>
  .view { display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  label:has(input[type='checkbox']) { justify-content: flex-start; }
  label.ov { color: var(--accent); }
  label input[type='range'] { flex: 1; min-width: 0; accent-color: var(--accent); }
  label span { width: 40px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  select { text-transform: capitalize; }
  input[type='color'] { width: 44px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
  .link { border: 0; background: transparent; padding: 0; text-align: left; color: var(--muted); }
  .options { display: flex; flex-direction: column; gap: 6px; padding: 6px 0 6px 8px; border-left: 2px solid var(--line); font-size: 12.5px; }
  .defaults { display: flex; gap: 6px; }
  .defaults button { flex: 1; padding: 5px 4px; font-size: 12px; }
</style>
