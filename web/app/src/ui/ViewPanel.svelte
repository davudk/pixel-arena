<script lang="ts">
  // View settings panel: filter preset + per-option overrides, time of day, grid, building
  // cutaway. Values shown are the resolved ones; overridden options are highlighted. "Make map
  // defaults" writes the current look into the map (undoable); "Use map defaults" drops this
  // viewer's overrides.
  import { onDestroy } from 'svelte'
  import { OPTIONS, PALETTE_NAMES, PRESET_ORDER, type OptionKey } from '../render/filters'
  import type { ViewKey, ViewSettings } from '../render/view-settings'
  import { ui } from './ui-state.svelte'
  import Icon from './Icon.svelte'

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
  const fmt = (n: number) => String(Number(n.toFixed(2)))
  /** Display names for preset and palette ids. */
  const NAMES: Record<string, string> = {
    pixel: 'Pixel', clean: 'Clean', retro: 'Retro', gameboy: 'Game Boy', 'oil painting': 'Oil painting', gothic: 'Gothic',
    sepia: 'Sepia', crt: 'CRT', none: 'None', levels: 'Color levels', pico8: 'PICO-8', vivid16: 'Vivid 16',
  }
  const nameOf = (id: string) => NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
</script>

<div class="view">
  <label class="field" class:ov={v.overridden.has('filter')}><span class="label">Filter</span>
    <select value={v.filter} onchange={(e) => settings.chooseFilter((e.currentTarget as HTMLSelectElement).value)}>
      {#each PRESET_ORDER as p (p)}<option value={p}>{nameOf(p)}</option>{/each}
    </select>
  </label>
  <button class="bare disclose" onclick={() => (showOptions = !showOptions)} aria-expanded={showOptions}>
    <Icon name={showOptions ? 'chevronDown' : 'chevronRight'} size={13} /> Filter options
  </button>
  {#if showOptions}
    <div class="options">
      {#each SLIDERS as s (s.key)}
        <label class="field" class:ov={v.overridden.has(s.key)}><span class="label">{s.label}</span>
          <input type="range" min={s.min} max={s.max} step={s.step} value={v.options[s.key]}
            oninput={(e) => set(s.key, Number((e.currentTarget as HTMLInputElement).value))} />
          <span class="val">{fmt(Number(v.options[s.key]))}</span>
        </label>
      {/each}
      <label class="field" class:ov={v.overridden.has('palette')}><span class="label">Palette</span>
        <select value={v.options.palette} onchange={(e) => set('palette', (e.currentTarget as HTMLSelectElement).value)}>
          {#each PALETTE_NAMES as p (p)}<option value={p}>{nameOf(p)}</option>{/each}
        </select>
      </label>
      <label class="field" class:ov={v.overridden.has('tint')}><span class="label">Tint</span>
        <span><input type="color" value={v.options.tint} oninput={(e) => set('tint', (e.currentTarget as HTMLInputElement).value)} /></span></label>
      <label class="field" class:ov={v.overridden.has('outline_color')}><span class="label">Outline color</span>
        <span><input type="color" value={v.options.outline_color} oninput={(e) => set('outline_color', (e.currentTarget as HTMLInputElement).value)} /></span></label>
    </div>
  {/if}
  <label class="field" class:ov={v.overridden.has('time_of_day')}><span class="label">Time</span>
    <input type="range" min="0" max="24" step="0.25" value={v.time} oninput={(e) => set('time_of_day', Number((e.currentTarget as HTMLInputElement).value))} />
    <span class="val">{clock}</span>
  </label>
  {#if v.cycle}
    <label class="field" class:ov={v.overridden.has('day_length')}><span class="label">Day length</span>
      <input type="range" min="0.5" max="60" step="0.5" value={v.dayMinutes} oninput={(e) => set('day_length', Number((e.currentTarget as HTMLInputElement).value) * 60)} />
      <span class="val">{v.dayMinutes} min</span>
    </label>
  {/if}
  <label class="field"><span class="label">Visible levels</span>
    <select bind:value={cutaway}>
      <option value={-1}>All levels</option>
      {#each [0, 1, 2, 3] as l (l)}<option value={l}>Up to level {l}</option>{/each}
    </select>
  </label>
  <label class="check" class:ov={v.overridden.has('time_mode')}><input type="checkbox" checked={v.cycle} onchange={(e) => set('time_mode', (e.currentTarget as HTMLInputElement).checked ? 'cycle' : 'fixed')} /> Day/night cycle</label>
  <label class="check" class:ov={v.overridden.has('grid')}><input type="checkbox" checked={v.grid} onchange={(e) => set('grid', (e.currentTarget as HTMLInputElement).checked)} /> Grid</label>
  <label class="check"><input type="checkbox" bind:checked={ui.showStats} /> Performance stats</label>
  <div class="defaults">
    <button onclick={onmapdefaults} title="Save the current look into this map">Make map defaults</button>
    <button onclick={() => settings.clearOverrides()} disabled={v.overridden.size === 0} title="Drop your own overrides">Use map defaults</button>
  </div>
</div>

<style>
  /* Values you've changed from the map's defaults are marked in the accent color. */
  .view { display: flex; flex-direction: column; gap: 8px; --label-w: 88px; }
  .ov, .ov > .label { color: var(--accent); }
  .val { flex: none !important; width: 44px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  input[type='color'] { width: 44px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: none; }
  .disclose { display: flex; align-items: center; gap: 6px; padding: 0; font-size: 12px; }
  .options { display: flex; flex-direction: column; gap: 6px; padding: 2px 0 2px 8px; border-left: 2px solid var(--line); }
  .defaults { display: flex; gap: 6px; }
  .defaults button { flex: 1; padding: 5px 4px; font-size: 12px; }
</style>
