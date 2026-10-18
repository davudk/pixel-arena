<script lang="ts">
  // "Saved" section at the top of a mode's panel: the saved tools of that mode's tools (see
  // MODE_TOOLS), with their number key when they have one. Click to pick one up, right-click to
  // rename, re-key or delete.
  import type { Library } from '../library/library'
  import type { Thumbnails } from '../library/thumbs'
  import ToolIcon from './ToolIcon.svelte'
  import ToolMenu from './ToolMenu.svelte'
  import { describe, label, ordered } from './saved-tools'
  import { ui } from './ui-state.svelte'
  import { MODE_TOOLS, type Mode } from '../editor/tools'

  interface Props {
    mode: Mode
    active: string | null
    library: Library | null
    thumbnails?: Thumbnails | null
    onuse: (id: string) => void
  }
  let { mode, active, library, thumbnails = null, onuse }: Props = $props()

  const tools = $derived(ordered(ui.tools).filter((t) => MODE_TOOLS[mode].includes(t.tool)))
  let menu: { id: string; anchor: HTMLElement } | null = $state(null)
</script>

{#if tools.length}
  <section class="saved">
    <h3>Saved</h3>
    {#each tools as t (t.id)}
      <button class="chip" class:on={active === t.id} title="{describe(t, library)}{t.slot ? ` (${t.slot})` : ''}"
        onclick={() => onuse(t.id)}
        oncontextmenu={(e) => { e.preventDefault(); menu = { id: t.id, anchor: e.currentTarget as HTMLElement } }}>
        <span class="key" class:empty={t.slot === null}>{t.slot ?? ''}</span>
        <ToolIcon tool={t} size={15} {library} {thumbnails} />
        <span class="label">{label(t, library)}</span>
      </button>
    {/each}
  </section>
{/if}

{#if menu}
  <ToolMenu id={menu.id} anchor={menu.anchor} {library} onclose={() => (menu = null)} />
{/if}

<style>
  .saved { display: flex; flex-direction: column; gap: 3px; }
  h3 { margin: 0 2px 3px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .chip { display: flex; align-items: center; gap: 8px; padding: 4px 8px; text-align: left; font-size: 12px; min-height: 30px; }
  .chip.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); border-color: rgba(242, 193, 78, 0.45); }
  .key { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--line); font-size: 10px; display: flex; align-items: center; justify-content: center; color: var(--muted); flex: none; }
  .key.empty { border-style: dashed; opacity: 0.5; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
