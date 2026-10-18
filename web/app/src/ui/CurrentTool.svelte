<script lang="ts">
  // The tool in hand, at the top of every mode panel. A label row ("Current tool", then Save and
  // Clear as text buttons; Save reads "Saved" when it matches a saved tool, Clear puts the tool
  // down like Esc), then a compact, read-only card of fixed height: the tool's picture (prop
  // thumbnail, liquid or material color, or icon), name and kind, and a summary of its settings
  // (edited in the panel's sections below; see ToolSettings.svelte). Choices made from the
  // panel's catalogue (prop, shape, material, liquid, kit, piece) show in the title. With
  // nothing in hand: the same box, dashed, "No tool selected".
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import type { Thumbnails } from '../library/thumbs'
  import { params, paramsChanged, type ParamTool } from '../editor/tool-params'
  import { applies, inHand, TOOLS, type ParamDef } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import { liquid } from '../world/liquids'
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
    const main = picked.filter((p) => !p.detail)
    // The most specific choice is the title; the tool, other choices and details go underneath.
    const title = main.length ? display(main.at(-1)!, values[main.at(-1)!.key]) : def.label
    const subtitle = [...(main.length ? [def.label] : []), ...main.slice(0, -1), ...picked.filter((p) => p.detail)]
      .map((x) => (typeof x === 'string' ? x : display(x, values[x.key]))).join(' · ')
    const controls = def.params.filter((p) => !PICKED.has(p.kind))
    const prop = tool === 'place' ? editor.library.props.get(params.place.prop) : undefined
    const credit = prop ? `${editor.library.packs.get(prop.packId)?.name ?? ''} · ${prop.attribution.author ?? ''} (${prop.attribution.license})` : ''
    return { tool, title, subtitle, controls, values, credit }
  })
  const saved = $derived(active ? ui.tools.find((t) => t.id === active) : undefined)
  /** Read-only summary of the settings: "Size 4 m", "Snap on"; ones that don't apply are left out. */
  const summary = $derived.by(() => {
    rev
    if (!now) return []
    return now.controls
      .filter((d) => applies(d, now.tool as ParamTool, editor.library))
      .map((d) => {
        const v = now.values[d.key]
        const value = d.kind === 'toggle' ? (v ? 'on' : 'off') : d.format ? d.format(Number(v)) : String(v)
        return { key: d.key, label: d.label, value, off: d.kind === 'toggle' && !v }
      })
  })
</script>

<div class="current-tool">
  <div class="bar">
    <span class="heading">Current tool</span>
    {#if now}
      <button class="text" disabled={!!saved} onclick={onsave}
        title={saved ? 'This tool is saved' : `Save this tool (${saveSlotKey()} saves it on a number key)`}>{saved ? 'Saved' : 'Save'}</button>
      <button class="text" onclick={onclear} title="Put the tool down ({key('Esc')})">Clear</button>
    {/if}
  </div>
  {#if now}
    <div class="card">
      <div class="head">
        <div class="pic" title={now.credit}><ToolIcon tool={{ tool: now.tool as ParamTool, params: now.values }} size={22} library={editor.library} {thumbnails} /></div>
        <div class="names">
          <div class="title">{now.title}</div>
          <div class="sub">{now.subtitle}{#if saved?.slot} · key {saved.slot}{/if}</div>
        </div>
      </div>
      {#if summary.length}
        <div class="summary">
          {#each summary as s (s.key)}<span class="pill" class:off={s.off}><span class="name">{s.label}</span> {s.value}</span>{/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="card empty-card"><span>No tool selected</span></div>
  {/if}
</div>

<style>
  .current-tool { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 4px; min-height: 22px; }
  .bar .heading { flex: 1; }
  .text { padding: 2px 8px; font-size: 12px; border-radius: var(--radius-sm); }
  .text:disabled { opacity: 1; color: var(--accent); border-color: transparent; background: transparent; }
  /* Always this tall, so the panel below doesn't jump as tools change. */
  .card {
    height: 104px; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden;
    border-radius: var(--radius-card); border: 1px solid var(--line); background: var(--card);
  }
  .empty-card { align-items: center; justify-content: center; border-style: dashed; background: transparent; color: var(--muted); }
  .head { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .pic {
    flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius); background: var(--input);
  }
  .names { flex: 1; min-width: 0; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .summary { display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start; overflow: hidden; }
  .pill {
    padding: 2px 7px; border-radius: var(--radius-sm); background: var(--input); font-size: 11.5px;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .pill .name { color: var(--muted); }
  .pill.off { color: var(--muted); }
</style>
