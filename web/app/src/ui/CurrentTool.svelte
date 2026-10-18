<script lang="ts">
  // The tool in hand, at the top of the tools container: a compact, read-only card with its
  // picture (prop thumbnail, liquid or material color, or icon), name (the most specific
  // catalogue choice: "Lava", "Raise", "Oak tree") and kind. On its right: a menu (add to or
  // remove from saved tools, or edit the saved one) and × to put the tool down (Esc). Its
  // settings are edited in the rows below it (ToolSettings.svelte). With nothing in hand: the
  // same box, dashed; clicking it picks up the mode's last tool.
  import { onDestroy } from 'svelte'
  import type { Editor } from '../editor/editor'
  import type { Thumbnails } from '../library/thumbs'
  import { params, paramsChanged, type ParamTool } from '../editor/tool-params'
  import { inHand, TOOLS, type ParamDef } from '../editor/tools'
  import { PALETTE } from '../render/terrain-shading'
  import { liquid } from '../world/liquids'
  import Icon from './Icon.svelte'
  import Popover from './Popover.svelte'
  import ToolIcon from './ToolIcon.svelte'
  import ToolMenu from './ToolMenu.svelte'
  import { key, saveSlotKey } from './keys'
  import { remove, label } from './saved-tools'
  import { ui } from './ui-state.svelte'

  interface Props {
    editor: Editor
    thumbnails: Thumbnails | null
    /** The saved tool matching the one in hand. */
    active: string | null
    /** The mode's tool to pick up from the empty card, and its name. */
    fallback: { tool: ParamTool; label: string } | null
    onsave: () => void
    onclear: () => void
    onpickup: () => void
  }
  let { editor, thumbnails, active, fallback, onsave, onclear, onpickup }: Props = $props()

  let rev = $state(0)
  const offs = [paramsChanged.connect(() => rev++), editor.toolChanged.connect(() => rev++)]
  onDestroy(() => offs.forEach((f) => f()))

  const PICKED = new Set<ParamDef['kind']>(['choice', 'material', 'prop', 'kit'])

  /** How a catalogue choice reads ("Raise", "Dirt", "Lava", "Wall", "Timber house"). */
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
    const prop = tool === 'place' ? editor.library.props.get(params.place.prop) : undefined
    const credit = prop ? `${editor.library.packs.get(prop.packId)?.name ?? ''} · ${prop.attribution.author ?? ''} (${prop.attribution.license})` : ''
    return { tool, title, subtitle, values, credit, saveable: def.saveable }
  })
  const saved = $derived(active ? ui.tools.find((t) => t.id === active) : undefined)

  let menuButton: HTMLButtonElement | null = $state(null)
  let menu: 'menu' | 'edit' | null = $state(null)
</script>

{#if now}
  <div class="card">
    <div class="pic" title={now.credit}><ToolIcon tool={{ tool: now.tool as ParamTool, params: now.values }} size={22} library={editor.library} {thumbnails} /></div>
    <div class="names">
      <div class="title">{now.title}</div>
      <div class="sub">{now.subtitle}{#if saved}{#if saved.slot} · key {saved.slot}{:else} · saved{/if}{/if}</div>
    </div>
    {#if now.saveable}
      <button class="icon bare-icon" class:on={menu !== null} bind:this={menuButton} aria-label="Tool menu" aria-expanded={menu !== null}
        title="Saved tools" onclick={() => (menu = menu ? null : 'menu')}><Icon name="menu" /></button>
    {/if}
    <button class="icon bare-icon" aria-label="Put the tool down" title="Put the tool down ({key('Esc')})" onclick={onclear}><Icon name="x" /></button>
  </div>
{:else}
  <button class="card empty-card" disabled={!fallback} onclick={onpickup} title={fallback ? `Pick up ${fallback.label}` : ''}>
    Nothing in hand
  </button>
{/if}

{#if menu === 'menu' && menuButton && now}
  <Popover anchor={menuButton} width={240} onclose={() => (menu = null)}>
    <div class="menu-list" role="menu">
      {#if saved}
        <button role="menuitem" onclick={() => (menu = 'edit')}>Name and key…</button>
        <button role="menuitem" onclick={() => { remove(saved.id); menu = null }}>Remove from saved tools</button>
      {:else}
        <button role="menuitem" onclick={() => { onsave(); menu = null }}>Add to saved tools<span class="shortcut">{saveSlotKey()}</span></button>
      {/if}
    </div>
  </Popover>
{:else if menu === 'edit' && menuButton && saved}
  <ToolMenu id={saved.id} anchor={menuButton} library={editor.library} onclose={() => (menu = null)} />
{/if}

<style>
  /* Always this tall, so the rows below don't jump as tools change. */
  .card {
    height: 54px; display: flex; align-items: center; gap: 10px; padding: 8px 6px 8px 8px; overflow: hidden;
    border-radius: var(--radius-card); border: 1px solid var(--line); background: var(--card); width: 100%;
  }
  .empty-card { justify-content: center; border-style: dashed; background: transparent; color: var(--muted); font-size: 12.5px; }
  .empty-card:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .empty-card:disabled { opacity: 1; }
  .pic {
    flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius); background: var(--input);
  }
  .names { flex: 1; min-width: 0; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bare-icon { flex: none; padding: 4px; border-color: transparent; background: transparent; color: var(--muted); }
  .bare-icon:hover:not(:disabled) { color: var(--text); background: var(--hover); }
  .bare-icon.on, .bare-icon.on:hover:not(:disabled) { color: var(--text); background: var(--hover); border-color: transparent; }
</style>
