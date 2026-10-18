<script lang="ts">
  // Build mode's left panel: the kit (cards drawn in the kit's colors), the piece to draw
  // (foundation, wall, door, window, erase) and the roof of the building being edited. Picking a
  // piece picks up the build tool; picking the active piece again puts it down. The level lives
  // in the bottom bar.
  import { onDestroy } from 'svelte'
  import { buildSettings, BuildingTool, type BuildMode } from '../editor/building-tool'
  import type { Editor } from '../editor/editor'
  import Icon from './Icon.svelte'

  let { editor }: { editor: Editor } = $props()

  const PIECES: { mode: BuildMode; label: string; icon: string }[] = [
    { mode: 'foundation', label: 'Foundation', icon: 'foundation' },
    { mode: 'wall', label: 'Wall', icon: 'wall' },
    { mode: 'door', label: 'Door', icon: 'door' },
    { mode: 'window', label: 'Window', icon: 'window' },
    { mode: 'erase', label: 'Erase', icon: 'eraser' },
  ]
  const ROOFS = ['gable', 'hip', 'flat', 'none']
  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))

  let rev = $state(0)
  const bump = () => rev++
  let offDoc = editor.session.doc.changed.connect(bump)
  const offs = [
    buildSettings.changed.connect(bump),
    editor.toolChanged.connect(bump),
    editor.selection.changed.connect(bump),
    editor.sessionChanged.connect((s) => {
      offDoc()
      offDoc = s.doc.changed.connect(bump)
      bump()
    }),
  ]
  onDestroy(() => {
    offDoc()
    offs.forEach((f) => f())
  })

  const tool = () => (editor.tool instanceof BuildingTool ? editor.tool : null)
  const view = $derived.by(() => {
    rev
    const target = tool()?.target ?? ''
    const roof = target ? String(editor.session.doc.getProp(target, 'roof/style') ?? 'gable') : null
    return { mode: buildSettings.mode, kitId: buildSettings.kitId, roof, armed: !!tool() }
  })

  function setMode(m: BuildMode) {
    if (tool() && buildSettings.mode === m) {
      editor.setTool(editor.defaultTool())
      return
    }
    buildSettings.mode = m
    buildSettings.changed.emit()
    if (!tool()) editor.setTool(new BuildingTool(editor))
  }

  function setKit(id: string) {
    const t = tool()
    if (t) t.setKit(id)
    else {
      buildSettings.kitId = id
      buildSettings.changed.emit()
    }
  }
</script>

<div class="panel-body">
  <h3>Kit</h3>
  <div class="kits">
    {#each kits as k (k.id)}
      <button class="kit" class:on={view.kitId === k.id} onclick={() => setKit(k.id)}>
        <svg viewBox="0 0 48 40" aria-hidden="true">
          <path d="M4 20 L24 6 L44 20 Z" fill={k.colors.roof} />
          <rect x="9" y="20" width="30" height="13" fill={k.colors.gable} />
          <rect x="21" y="25" width="6" height="8" fill="rgba(0,0,0,0.35)" />
          <rect x="6" y="33" width="36" height="4" fill={k.colors.foundation} />
        </svg>
        <span>{k.name}</span>
      </button>
    {/each}
  </div>
  <h3>Piece</h3>
  <div class="tiles">
    {#each PIECES as p (p.mode)}
      <button class="tile" class:on={view.armed && view.mode === p.mode} aria-pressed={view.armed && view.mode === p.mode} onclick={() => setMode(p.mode)}><Icon name={p.icon} size={22} /><span>{p.label}</span></button>
    {/each}
  </div>
  <h3>Roof</h3>
  <div class="roofs" title={view.roof === null ? 'No building being edited' : ''}>
    {#each ROOFS as r (r)}
      <button class:on={view.roof === r} disabled={view.roof === null} onclick={() => tool()?.setRoof(r)}>{r}</button>
    {/each}
  </div>
</div>

<style>
  .panel-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; }
  h3 { margin: 4px 2px 0; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .kits { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
  .kit { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 6px; font-size: 12px; }
  .kit svg { width: 64px; height: 54px; }
  .kit.on, .tile.on, .roofs button.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; font-size: 12px; }
  .roofs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .roofs button { padding: 6px 0; text-transform: capitalize; }
</style>
