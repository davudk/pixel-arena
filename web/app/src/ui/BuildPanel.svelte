<script lang="ts">
  // Build mode's left panel, from the registry's build tool: saved build tools, the kit (cards
  // drawn in the kit's colors), the piece (picking it picks up the tool; the piece in hand again
  // puts it down), the roof of the building being edited, and "Save tool". The level is a quick
  // setting in the bottom bar.
  import { onDestroy } from 'svelte'
  import { BuildingTool } from '../editor/building-tool'
  import type { Editor } from '../editor/editor'
  import { params, paramsChanged, setParams } from '../editor/tool-params'
  import { inHand, pickUp, putDown, TOOLS } from '../editor/tools'
  import Icon from './Icon.svelte'
  import SavedTools from './SavedTools.svelte'
  import { saveTool } from './saved-tools'

  interface Props {
    editor: Editor
    active: string | null
    onuse: (id: string) => void
  }
  let { editor, active, onuse }: Props = $props()

  const ROOFS = ['gable', 'hip', 'flat', 'none']
  const kits = [...editor.library.kits.values()].sort((a, b) => a.name.localeCompare(b.name))
  const pieces = TOOLS.build.params.find((p) => p.key === 'piece')!.options!

  let rev = $state(0)
  const bump = () => rev++
  let offDoc = editor.session.doc.changed.connect(bump)
  const offs = [
    paramsChanged.connect(bump),
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
    const target = tool()?.hasTarget() ? tool()!.target : ''
    const roof = target ? String(editor.session.doc.getProp(target, 'roof/style') ?? 'gable') : null
    return { piece: params.build.piece, kit: params.build.kit, roof, armed: inHand(editor) === 'build' }
  })

  function choosePiece(piece: string) {
    if (view.armed && view.piece === piece) putDown(editor)
    else pickUp(editor, 'build', { piece: piece as never })
  }

  /** Picks the kit for new buildings; with a building being edited, changes its kit too. */
  function chooseKit(id: string) {
    const t = tool()
    if (t) t.setKit(id)
    else setParams('build', { kit: id })
  }
</script>

<div class="panel-body">
  <SavedTools mode="build" {active} library={editor.library} {onuse} />
  <h3>Kit</h3>
  <div class="kits">
    {#each kits as k (k.id)}
      <button class="kit" class:on={view.kit === k.id} onclick={() => chooseKit(k.id)}>
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
    {#each pieces as p (p.value)}
      {@const on = view.armed && view.piece === p.value}
      <button class="tile" class:on aria-pressed={on} onclick={() => choosePiece(String(p.value))}><Icon name={p.icon ?? ''} size={22} /><span>{p.label}</span></button>
    {/each}
  </div>
  <h3>Roof</h3>
  <div class="roofs" title={view.roof === null ? 'No building being edited' : ''}>
    {#each ROOFS as r (r)}
      <button class:on={view.roof === r} disabled={view.roof === null} onclick={() => tool()?.setRoof(r)}>{r}</button>
    {/each}
  </div>
  <button class="save" disabled={!view.armed} title={view.armed ? 'Save this kit and piece (Cmd/Ctrl+1–9 saves it on a number key)' : 'Pick a piece first'}
    onclick={() => saveTool(editor)}><Icon name="plus" size={14} /> Save tool</button>
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
  .save { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; }
</style>
