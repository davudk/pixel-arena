<script lang="ts">
  // Terrain mode's left panel, top to bottom: saved brushes (number keys), Sculpt (raise, lower,
  // smooth, flatten in one row), Paint (a material swatch is the paint tool), and Brush (size and
  // strength for whichever tool is active, plus "Save as brush"). Clicking the active tool again
  // puts the tool down (no tool; Esc does the same); the panel stays.
  import { onDestroy } from 'svelte'
  import { TerrainTool, terrainSettings, type TerrainMode } from '../editor/terrain-tool'
  import type { Editor } from '../editor/editor'
  import { PALETTE } from '../render/terrain-shading'
  import BrushIcon from './BrushIcon.svelte'
  import BrushMenu from './BrushMenu.svelte'
  import Icon from './Icon.svelte'
  import { brushLabel, isCurrent, saveBrush, SLOTS } from './brushes'
  import { ui } from './ui-state.svelte'
  import { desktop } from '../platform'

  interface Props {
    editor: Editor
    onuse: (slot: number) => void
  }
  let { editor, onuse }: Props = $props()

  const SCULPT: { mode: TerrainMode; label: string; icon: string }[] = [
    { mode: 'raise', label: 'Raise', icon: 'raise' },
    { mode: 'lower', label: 'Lower', icon: 'lower' },
    { mode: 'smooth', label: 'Smooth', icon: 'smooth' },
    { mode: 'flatten', label: 'Flatten', icon: 'flatten' },
  ]
  const SIZES = [1, 2, 4, 8, 16, 32]
  const STRENGTHS = [0.1, 0.25, 0.5, 0.75, 1]

  let mode = $state(terrainSettings.mode)
  let material = $state(terrainSettings.material)
  let radius = $state(terrainSettings.radius)
  let strength = $state(terrainSettings.strength)
  let armed = $state(editor.tool instanceof TerrainTool)
  let menu: { slot: number; anchor: HTMLElement } | null = $state(null)

  const offs = [
    terrainSettings.changed.connect(() => {
      mode = terrainSettings.mode
      material = terrainSettings.material
      radius = terrainSettings.radius
      strength = terrainSettings.strength
    }),
    editor.toolChanged.connect((t) => (armed = t instanceof TerrainTool)),
  ]
  onDestroy(() => offs.forEach((f) => f()))

  $effect(() => {
    if (terrainSettings.radius === radius && terrainSettings.strength === strength) return
    terrainSettings.radius = radius
    terrainSettings.strength = strength
    terrainSettings.changed.emit()
  })

  /** Picks a tool (and arms it); picking the armed one again puts it down. */
  function pick(m: TerrainMode, mat = material) {
    if (armed && mode === m && (m !== 'paint' || mat === material)) {
      editor.setTool(editor.defaultTool())
      return
    }
    terrainSettings.mode = m
    terrainSettings.material = mat
    terrainSettings.changed.emit()
    if (!armed) editor.setTool(new TerrainTool(editor))
  }

  const meters = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)} m`
  const percent = (s: number) => `${Math.round(s * 100)}%`
  const current = $derived.by(() => {
    mode; material; radius; strength
    return armed ? ui.brushes.find(isCurrent)?.slot ?? null : null
  })
  const full = $derived(ui.brushes.length >= SLOTS)
  // Cmd/Ctrl+digit switches browser tabs, so the browser build saves with Alt.
  const saveKey = desktop ? (navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+') : 'Alt+'
</script>

<div class="panel-body">
  {#if ui.brushes.length}
    <section>
      <h3>Saved brushes</h3>
      <div class="saved">
        {#each ui.brushes as b (b.slot)}
          <button class="chip" class:on={current === b.slot} title="{brushLabel(b)} · right-click to edit"
            onclick={() => onuse(b.slot)}
            oncontextmenu={(e) => { e.preventDefault(); menu = { slot: b.slot, anchor: e.currentTarget as HTMLElement } }}>
            <span class="key">{b.slot}</span><BrushIcon brush={b} size={15} /><span class="label">{brushLabel(b)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <h3>Sculpt</h3>
    <div class="sculpt">
      {#each SCULPT as s (s.mode)}
        <button class="tile" class:on={armed && mode === s.mode} aria-pressed={armed && mode === s.mode} onclick={() => pick(s.mode)}>
          <Icon name={s.icon} size={20} /><span>{s.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Paint</h3>
    <div class="materials">
      {#each PALETTE as m, i (m.name)}
        <button class="material" class:on={armed && mode === 'paint' && material === i} aria-pressed={armed && mode === 'paint' && material === i}
          title="Paint {m.name}" onclick={() => pick('paint', i)}>
          <span class="swatch" style:background={m.color}></span><span>{m.name}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="brush">
    <h3>Brush</h3>
    <div class="slider">
      <span class="name">Size</span>
      <input type="range" min="1" max="32" step="0.5" bind:value={radius} aria-label="Brush size" />
      <span class="val">{meters(radius)}</span>
    </div>
    <div class="presets">{#each SIZES as v (v)}<button class:on={radius === v} onclick={() => (radius = v)}>{v}</button>{/each}</div>
    <div class="slider">
      <span class="name">Strength</span>
      <input type="range" min="0.05" max="1" step="0.05" bind:value={strength} aria-label="Brush strength" />
      <span class="val">{percent(strength)}</span>
    </div>
    <div class="presets">{#each STRENGTHS as v (v)}<button class:on={Math.abs(strength - v) < 1e-6} onclick={() => (strength = v)}>{percent(v)}</button>{/each}</div>
    <button class="save" disabled={full} title={full ? 'All 9 keys are used; right-click a brush to replace it' : `Save to the next free key (or press ${saveKey}1–9)`}
      onclick={() => saveBrush()}>
      <Icon name="plus" size={14} /> Save as brush <span class="hint">{saveKey}1–9</span>
    </button>
  </section>
</div>

{#if menu}
  <BrushMenu slot={menu.slot} anchor={menu.anchor} onclose={() => (menu = null)} />
{/if}

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; flex: 1; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0 2px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .on { background: rgba(242, 193, 78, 0.16) !important; color: var(--accent) !important; border-color: rgba(242, 193, 78, 0.45) !important; }

  .saved { display: flex; flex-direction: column; gap: 3px; }
  .chip { display: flex; align-items: center; gap: 8px; padding: 5px 8px; text-align: left; font-size: 12px; }
  .chip .key { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--line); font-size: 10px; display: flex; align-items: center; justify-content: center; color: var(--muted); flex: none; }
  .chip .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .sculpt { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; font-size: 11.5px; min-width: 0; }

  .materials { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 4px; }
  .material { display: flex; align-items: center; gap: 8px; padding: 5px 6px; text-align: left; font-size: 12px; }
  .swatch { width: 24px; height: 24px; border-radius: 6px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3); }

  .slider { display: flex; align-items: center; gap: 8px; }
  .slider .name { width: 58px; color: var(--muted); font-size: 12px; }
  .slider input { flex: 1; min-width: 0; accent-color: var(--accent); }
  .slider .val { width: 40px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }
  .presets { display: flex; gap: 3px; margin: 0 0 4px 66px; }
  .presets button { flex: 1; padding: 3px 0; font-size: 11px; font-variant-numeric: tabular-nums; min-width: 0; }
  .save { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; }
  .save .hint { color: var(--muted); font-size: 11px; }
</style>
