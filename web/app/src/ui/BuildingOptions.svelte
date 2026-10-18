<script lang="ts">
  // Building tool options: mode, kit, level (with cutaway) and roof style for the target building.
  import { onDestroy } from 'svelte'
  import { buildSettings, BuildingTool, MAX_LEVEL, type BuildMode } from '../editor/building-tool'
  import type { Editor } from '../editor/editor'

  let { editor }: { editor: Editor } = $props()

  const MODES: BuildMode[] = ['foundation', 'erase', 'wall', 'door', 'window']
  const ROOFS = ['gable', 'hip', 'flat', 'none']
  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))
  let mode = $state(buildSettings.mode)
  let kitId = $state(buildSettings.kitId)
  let level = $state(buildSettings.level)

  const off = buildSettings.changed.connect(() => {
    mode = buildSettings.mode
    kitId = buildSettings.kitId
    level = buildSettings.level
  })
  onDestroy(off)

  const tool = () => (editor.tool instanceof BuildingTool ? editor.tool : null)

  function setMode(m: BuildMode) {
    mode = m
    buildSettings.mode = m
  }
</script>

<div class="options">
  <div class="modes">
    {#each MODES as m (m)}
      <button class:on={mode === m} onclick={() => setMode(m)}>{m}</button>
    {/each}
  </div>
  <div class="row">
    <select value={kitId} onchange={(e) => tool()?.setKit((e.currentTarget as HTMLSelectElement).value)}>
      {#each kits as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
    </select>
    <div class="level">
      <button onclick={() => tool()?.setLevel(level - 1)} disabled={level <= 0} title="Level down (PageDown / ,)">▼</button>
      <span>Level {level}</span>
      <button onclick={() => tool()?.setLevel(level + 1)} disabled={level >= MAX_LEVEL} title="Level up (PageUp / .)">▲</button>
    </div>
  </div>
  <div class="row roofs">
    <span>Roof</span>
    {#each ROOFS as r (r)}<button onclick={() => tool()?.setRoof(r)}>{r}</button>{/each}
  </div>
  <p class="hint">Drag to paint floor cells · click edges for walls / doors / windows · Esc</p>
</div>

<style>
  .options {
    position: absolute; top: 64px; left: 12px; width: 440px; padding: 10px 12px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; gap: 8px;
  }
  .modes { display: flex; gap: 4px; }
  .modes button { flex: 1; padding: 5px 0; text-transform: capitalize; }
  .modes button.on { background: rgba(242, 193, 78, 0.18); color: var(--accent); border-color: rgba(242, 193, 78, 0.4); }
  .row { display: flex; align-items: center; gap: 8px; }
  .row select { flex: 1; }
  .level { display: flex; align-items: center; gap: 6px; }
  .level span { min-width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
  .level button { padding: 5px 9px; }
  .roofs span { color: var(--muted); }
  .roofs button { flex: 1; padding: 5px 0; text-transform: capitalize; }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; }
</style>
