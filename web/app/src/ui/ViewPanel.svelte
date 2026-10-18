<script lang="ts">
  // The View popover's body, in three groups. Look: the filter preset, and under "Customize" its
  // options. Time: time of day, and the day/night cycle with its length. Display: camera,
  // visible levels, grid, performance stats. Values shown are the resolved ones; a value you
  // changed from the map's shows its label in the accent color and a reset button. "Save as map
  // default" writes the current look into the map (undoable); "Reset to map" drops all of
  // this viewer's changes.
  import { onDestroy } from 'svelte'
  import { OPTIONS, PALETTE_NAMES, PRESET_ORDER, type OptionKey } from '../render/filters'
  import type { ViewKey, ViewSettings } from '../render/view-settings'
  import { key } from './keys'
  import { ui } from './ui-state.svelte'
  import Icon from './Icon.svelte'

  interface Props {
    settings: ViewSettings
    cutaway: number
    clock: string
    onmapdefaults: () => void
    topDown: boolean
    ontopdown: (on: boolean) => void
  }
  let { settings, cutaway = $bindable(), clock, onmapdefaults, topDown, ontopdown }: Props = $props()

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

{#snippet reset(k: ViewKey)}
  {#if v.overridden.has(k)}
    <button class="bare reset" title="Back to the map's value" aria-label="Reset" onclick={() => settings.clearOverride(k)}><Icon name="reset" size={13} /></button>
  {/if}
{/snippet}

{#snippet slider(k: ViewKey, label: string, min: number, max: number, step: number, value: number, shown: string, onset: (n: number) => void, sub = false)}
  <div class="field" class:ov={v.overridden.has(k)} class:sub>
    <span class="label" title={label}>{label}</span>
    <div class="slider">
      <input type="range" {min} {max} {step} {value} aria-label={label} oninput={(e) => onset(Number((e.currentTarget as HTMLInputElement).value))} />
      <span class="val"><span class="readout">{shown}</span></span>
    </div>
    {@render reset(k)}
  </div>
{/snippet}

<div class="view">
  <section class="section">
    <h3 class="heading">Look</h3>
    <div class="field" class:ov={v.overridden.has('filter')}><span class="label">Filter</span>
      <select value={v.filter} aria-label="Filter" onchange={(e) => settings.chooseFilter((e.currentTarget as HTMLSelectElement).value)}>
        {#each PRESET_ORDER as p (p)}<option value={p}>{nameOf(p)}</option>{/each}
      </select>
      {@render reset('filter')}
    </div>
    <button class="bare disclose" onclick={() => (showOptions = !showOptions)} aria-expanded={showOptions}>
      <Icon name={showOptions ? 'chevronDown' : 'chevronRight'} size={13} />Customize
    </button>
    {#if showOptions}
      {#each SLIDERS as sl (sl.key)}
        {@render slider(sl.key, sl.label, sl.min, sl.max, sl.step, Number(v.options[sl.key]), fmt(Number(v.options[sl.key])), (n) => set(sl.key, n), true)}
      {/each}
      <div class="field sub" class:ov={v.overridden.has('palette')}><span class="label">Palette</span>
        <select value={v.options.palette} aria-label="Palette" onchange={(e) => set('palette', (e.currentTarget as HTMLSelectElement).value)}>
          {#each PALETTE_NAMES as p (p)}<option value={p}>{nameOf(p)}</option>{/each}
        </select>
        {@render reset('palette')}
      </div>
      <div class="field sub" class:ov={v.overridden.has('tint')}><span class="label">Tint</span>
        <span><input type="color" value={v.options.tint} aria-label="Tint" oninput={(e) => set('tint', (e.currentTarget as HTMLInputElement).value)} /></span>
        {@render reset('tint')}
      </div>
      <div class="field sub" class:ov={v.overridden.has('outline_color')}><span class="label">Outline</span>
        <span><input type="color" value={v.options.outline_color} aria-label="Outline color" oninput={(e) => set('outline_color', (e.currentTarget as HTMLInputElement).value)} /></span>
        {@render reset('outline_color')}
      </div>
    {/if}
  </section>

  <section class="section">
    <h3 class="heading">Time</h3>
    {@render slider('time_of_day', 'Time', 0, 24, 0.25, v.time, clock, (n) => set('time_of_day', n))}
    <div class="field" class:ov={v.overridden.has('time_mode')}><span class="label">Day/night</span>
      <button class="switch" class:on={v.cycle} role="switch" aria-checked={v.cycle} aria-label="Day/night cycle" onclick={() => set('time_mode', v.cycle ? 'fixed' : 'cycle')}></button>
      {@render reset('time_mode')}
    </div>
    {#if v.cycle}
      {@render slider('day_length', 'Day length', 0.5, 60, 0.5, v.dayMinutes, `${v.dayMinutes} min`, (n) => set('day_length', n * 60), true)}
    {/if}
  </section>

  <section class="section">
    <h3 class="heading">Display</h3>
    <div class="field"><span class="label">Camera</span>
      <div class="seg" role="group" aria-label="Camera">
        <button class:on={!topDown} aria-pressed={!topDown} title="Isometric ({key('U')})" onclick={() => ontopdown(false)}>Isometric</button>
        <button class:on={topDown} aria-pressed={topDown} title="Top-down ({key('U')})" onclick={() => ontopdown(true)}>Top-down</button>
      </div>
    </div>
    <label class="field"><span class="label">Levels</span>
      <select bind:value={cutaway}>
        <option value={-1}>All levels</option>
        {#each [0, 1, 2, 3] as l (l)}<option value={l}>Up to level {l}</option>{/each}
      </select>
    </label>
    <div class="field" class:ov={v.overridden.has('grid')}><span class="label">Grid</span>
      <button class="switch" class:on={v.grid} role="switch" aria-checked={v.grid} aria-label="Grid" onclick={() => set('grid', !v.grid)}></button>
      {@render reset('grid')}
    </div>
    <div class="field"><span class="label">Stats</span>
      <button class="switch" class:on={ui.showStats} role="switch" aria-checked={ui.showStats} aria-label="Performance stats" title="Frame rate and draw calls" onclick={() => (ui.showStats = !ui.showStats)}></button>
    </div>
  </section>

  <div class="action-bar">
    <button onclick={onmapdefaults} title="Save the current look into this map (undoable)">Save as map default</button>
    <button onclick={() => settings.clearOverrides()} disabled={v.overridden.size === 0} title="Drop all your changes to the view">Reset to map</button>
  </div>
</div>

<style>
  /* Values you've changed from the map's are marked in the accent color. */
  .view { display: flex; flex-direction: column; gap: 16px; }
  .ov > .label { color: var(--accent); }
  .readout { flex: 1; text-align: right; font-variant-numeric: tabular-nums; }
  input[type='color'] { width: 44px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: none; }
  .disclose { display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 12px; align-self: flex-start; }
  .field > .reset { flex: none; padding: 2px; }
  .field > .reset:hover:not(:disabled) { color: var(--accent); }
</style>
