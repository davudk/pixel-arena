<script lang="ts">
  // The tool in hand, at the top of every mode panel, always the same height: its picture (prop
  // thumbnail, liquid or material color, or icon), its name, what kind of tool it is, Save (shows
  // "Saved" when it matches a saved tool) and Clear (puts it down, like Esc), then its settings,
  // drawn from the registry (tools.ts). Choices made from the panel's catalogue (prop, shape,
  // material, liquid, kit, piece) show in the title instead of as controls. With nothing in hand:
  // a dashed outline.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import type { Thumbnails } from '../library/thumbs'
  import { params, paramsChanged, type ParamTool } from '../editor/tool-params'
  import { applies, inHand, TOOLS, type ParamDef } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import { liquid } from '../world/liquids'
  import Icon from './Icon.svelte'
  import ParamControl from './ParamControl.svelte'
  import ToolIcon from './ToolIcon.svelte'
  import { key, saveSlotKey } from './keys'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
    thumbnails: Thumbnails | null
    /** The saved tool matching the one in hand. */
    active: string | null
    onsave: () => void
    onclear: () => void
  }
  let { editor, thumbnails, active, onsave, onclear }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const PICKED = new Set<ParamDef['kind']>(['choice', 'material', 'prop', 'kit'])

  /** How a catalogue choice reads ("Raise", "Dirt", "Lava", "Bed", "Timber house"). */
  function display(def: ParamDef, value: unknown): string {
    if (def.kind === 'prop') return editor.library.props.get(String(value))?.name ?? String(value)
    if (def.kind === 'kit') return editor.library.kits.get(String(value))?.name ?? String(value)
    if (def.kind === 'material') return PALETTE[Number(value)]?.name ?? String(value)
    if (def.key === 'liquid') return liquid(value).name
    return String(def.options?.find((o) => o.value === value)?.label ?? value)
  }

  const now = $derived.by(() => {
    rev
    const tool = inHand(editor)
    if (!tool) return null
    const def = TOOLS[tool]
    const values = params[tool] as unknown as Record<string, unknown>
    const picked = def.params.filter((p) => PICKED.has(p.kind))
    // The most specific choice is the title; the tool and any other choices go underneath.
    const title = picked.length ? display(picked.at(-1)!, values[picked.at(-1)!.key]) : def.label
    const subtitle = [def.label, ...picked.slice(0, -1).map((p) => display(p, values[p.key]))].join(' · ')
    const controls = def.params.filter((p) => !PICKED.has(p.kind))
    const prop = tool === 'place' ? editor.library.props.get(params.place.prop) : undefined
    const credit = prop ? `${editor.library.packs.get(prop.packId)?.name ?? ''} · ${prop.attribution.author ?? ''} (${prop.attribution.license})` : ''
    return { tool, title, subtitle, controls, values, credit }
  })
  const saved = $derived(active ? ui.tools.find((t) => t.id === active) : undefined)
  const ranges = $derived(now ? now.controls.filter((p) => p.kind === 'range') : [])
  const others = $derived(now ? now.controls.filter((p) => p.kind !== 'range') : [])
</script>

{#if now}
  <div class="current" aria-label="Current tool">
    <div class="head">
      <div class="pic" title={now.credit}><ToolIcon tool={{ tool: now.tool as ParamTool, params: now.values }} size={26} library={editor.library} {thumbnails} /></div>
      <div class="names">
        <div class="title">{now.title}</div>
        <div class="sub">{now.subtitle}{#if saved} · {saved.slot ? `saved on ${saved.slot}` : 'saved'}{/if}</div>
      </div>
      <button class="icon" class:on={!!saved} disabled={!!saved} onclick={onsave} aria-label="Save tool"
        title={saved ? 'Saved' : `Save tool (${saveSlotKey()} saves it on a number key)`}><Icon name={saved ? 'check' : 'plus'} /></button>
      <button class="icon" onclick={onclear} aria-label="Clear tool" title="Clear tool ({key('Esc')})"><Icon name="x" /></button>
    </div>
    <div class="settings">
      {#if others.length}
        <div class="toggles">
          {#each others as def (`${now.tool}:${def.key}`)}<ParamControl tool={now.tool as ParamTool} {def} library={editor.library} />{/each}
        </div>
      {/if}
      {#each ranges as def (`${now.tool}:${def.key}`)}
        <ParamControl tool={now.tool as ParamTool} {def} library={editor.library} />
      {/each}
      {#if !others.length && !ranges.length}<p class="none">No settings</p>{/if}
    </div>
  </div>
{:else}
  <div class="current empty-card" aria-label="Current tool"><span>No tool selected</span></div>
{/if}

<style>
  .current {
    flex: none; height: 232px; display: flex; flex-direction: column; border-radius: var(--radius-card);
    border: 1px solid var(--line); background: var(--card); overflow: hidden;
  }
  .empty-card { align-items: center; justify-content: center; border-style: dashed; background: transparent; color: var(--muted); }
  .head { display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid var(--line); }
  .pic {
    flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius); background: var(--input);
  }
  .names { flex: 1; min-width: 0; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .head button:disabled { opacity: 1; cursor: default; }
  .settings { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .toggles { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .none { margin: auto; color: var(--muted); font-size: 12px; }
</style>
