<script lang="ts">
  // Select mode's left panel: every object on the map, grouped by type, with things that sit on
  // others indented under them. Click selects (Shift or Cmd adds), double-click focuses the
  // camera on it.
  import { onDestroy } from 'svelte'
  import type { MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import Icon from './Icon.svelte'
  import { objectPosition, outline } from './objects'
  import { ui } from './ui-state.svelte'

  let { editor }: { editor: Editor } = $props()

  let query = $state('')
  let rev = $state(0)
  const bump = () => rev++
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    // Only structure and names matter here, not every move.
    const offs = [
      s.doc.changed.connect((op) => {
        if (op.op === 'create' || op.op === 'delete' || op.op === 'restore' || (op.op === 'set' && (op.path === 'parent' || op.path === 'prop' || op.path === 'kit'))) bump()
      }),
      s.doc.reset.connect(bump),
    ]
    offDoc = () => offs.forEach((f) => f())
    bump()
  }
  watch(editor.session)
  const offs = [editor.selection.changed.connect(bump), editor.sessionChanged.connect(watch)]
  onDestroy(() => {
    offDoc()
    offs.forEach((f) => f())
  })

  const groups = $derived.by(() => {
    rev
    return outline(editor.session.doc, editor.library, query)
  })
  const selected = $derived.by(() => {
    rev
    return new Set(editor.selection.list())
  })
  const collapsed = $derived(new Set(ui.collapsedGroups))

  function pick(e: MouseEvent, id: string) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) editor.selection.toggle(id)
    else editor.selection.set([id])
  }

  function focus(id: string) {
    const obj = editor.session.doc.getObject(id)
    if (!obj) return
    const p = objectPosition(obj)
    editor.rig.focus.set(p.x, 0, p.z)
  }

  function toggleGroup(key: string) {
    const k = `outline:${key}`
    ui.collapsedGroups = collapsed.has(k) ? ui.collapsedGroups.filter((g) => g !== k) : [...ui.collapsedGroups, k]
  }
</script>

<div class="outliner">
  <label class="search">
    <Icon name="search" size={14} />
    <input placeholder="Search objects" bind:value={query} />
    {#if query}<button class="clear" aria-label="Clear search" onclick={() => (query = '')}><Icon name="x" size={12} /></button>{/if}
  </label>
  <div class="list">
    {#each groups as g (g.key)}
      {@const open = !collapsed.has(`outline:${g.key}`)}
      <button class="group" onclick={() => toggleGroup(g.key)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} /><span>{g.label}</span><span class="count">{g.rows.length}</span>
      </button>
      {#if open}
        {#each g.rows as r (r.id)}
          <button class="row" class:on={selected.has(r.id)} style:padding-left="{22 + r.depth * 14}px"
            onclick={(e) => pick(e, r.id)} ondblclick={() => focus(r.id)} title="Double-click to focus">{r.name}</button>
        {/each}
      {/if}
    {:else}
      <p class="empty">{query ? `No objects match “${query}”` : 'The map is empty'}</p>
    {/each}
  </div>
</div>

<style>
  .outliner { display: flex; flex-direction: column; gap: 8px; padding: 10px; min-height: 0; flex: 1; }
  .search {
    display: flex; align-items: center; gap: 6px; padding: 0 8px; border-radius: 8px;
    border: 1px solid var(--line); background: #0f1115; color: var(--muted);
  }
  .search:focus-within { border-color: var(--accent); }
  .search input { flex: 1; min-width: 0; padding: 7px 0; border: 0; outline: none; background: transparent; color: var(--text); font: inherit; }
  .clear { padding: 2px; border: 0; background: transparent; color: var(--muted); }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
  .group {
    display: flex; align-items: center; gap: 6px; padding: 6px 2px 4px; border: 0; background: transparent;
    font-size: 12px; font-weight: 500; text-align: left; position: sticky; top: 0; background: #1b1e25; z-index: 1;
  }
  .group:hover:not(:disabled) { background: #1b1e25; color: var(--accent); }
  .group .count { margin-left: auto; color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }
  .row {
    border: 0; border-radius: 6px; background: transparent; padding: 3px 8px; text-align: left; font-size: 12.5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none;
  }
  .row:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); }
  .row.on { background: rgba(242, 193, 78, 0.16); color: var(--accent); }
  .empty { color: var(--muted); text-align: center; padding: 20px 8px; margin: 0; }
</style>
