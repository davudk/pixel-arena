<script lang="ts">
  // Select mode's left panel: every object on the map. View options (popover, same wording as the
  // props panel): group by object type, prop category or none; sort by name, custom order (drag to
  // reorder), newest or oldest.
  // User groups are expandable rows; things sitting on others are indented under them.
  // Click selects (a group row selects its members), Cmd/Ctrl adds, Shift selects a range,
  // double-click focuses the camera. Drag a row onto another to reorder (switches to custom
  // order), or onto the middle of a group to move it in. Each row has a lock toggle; right-click
  // for rename, group, ungroup, lock, focus and delete.
  import { onDestroy, tick } from 'svelte'
  import type { MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import type { SelectTool } from '../editor/select-tool'
  import { GROUP, members, rename, reorder, setLocked } from '../editor/grouping'
  import { objectName } from '../editor/labels'
  import Icon from './Icon.svelte'
  import Popover from './Popover.svelte'
  import SearchField from './SearchField.svelte'
  import { key } from './keys'
  import { canGroup, canUngroup, groupSelected, toggleLockSelected, ungroupSelected } from './object-actions'
  import { objectPosition, outline, siblings, type OutlineRow } from './objects'
  import { ui, type OutlineGroupBy, type OutlineSort } from './ui-state.svelte'

  interface Props {
    editor: Editor
    selectTool: () => SelectTool
  }
  let { editor, selectTool }: Props = $props()

  let query = $state('')
  let rev = $state(0)
  const bump = () => rev++
  let offDoc = () => {}
  const watch = (s: MapSession) => {
    offDoc()
    const offs = [
      s.doc.changed.connect((op) => {
        if (op.op === 'create' || op.op === 'delete' || op.op === 'restore' ||
          (op.op === 'set' && ['parent', 'prop', 'kit', 'group', 'locked', 'name', 'order', 'liquid'].includes(op.path))) bump()
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

  const COLLAPSE = 'o:'
  const collapsed = $derived(new Set(ui.collapsedGroups.filter((k) => k.startsWith(COLLAPSE)).map((k) => k.slice(COLLAPSE.length))))
  const sections = $derived.by(() => {
    rev
    return outline(editor.session.doc, editor.library, { query, groupBy: ui.outliner.groupBy, sort: ui.outliner.sort, collapsed })
  })
  const flat = $derived(sections.flatMap((s) => s.rows))
  const selected = $derived.by(() => {
    rev
    return new Set(editor.selection.list())
  })
  const sectionOpen = (key: string) => !ui.collapsedGroups.includes(`os:${key}`)

  /** What a row stands for in the selection: a group's members, else the object. */
  const targets = (r: OutlineRow) => (r.isGroup ? members(editor.session.doc, r.id) : [r.id])
  const isOn = (r: OutlineRow) => {
    const t = targets(r)
    return t.length > 0 && t.every((id) => selected.has(id))
  }

  let anchor: string | null = null
  function pick(e: MouseEvent, r: OutlineRow) {
    const sel = editor.selection
    if (e.shiftKey && anchor) {
      const a = flat.findIndex((x) => x.id === anchor)
      const b = flat.findIndex((x) => x.id === r.id)
      if (a >= 0 && b >= 0) {
        const range = flat.slice(Math.min(a, b), Math.max(a, b) + 1).flatMap(targets)
        sel.set(new Set([...(e.metaKey || e.ctrlKey ? sel.list() : []), ...range]))
        return
      }
    }
    anchor = r.id
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(sel.list())
      const on = isOn(r)
      for (const id of targets(r)) on ? next.delete(id) : next.add(id)
      sel.set(next)
    } else sel.set(targets(r))
  }

  function focus(r: OutlineRow) {
    const ids = targets(r)
    const pts = ids.map((id) => editor.session.doc.getObject(id)).filter((o) => !!o).map((o) => objectPosition(o!))
    if (!pts.length) return
    editor.rig.focus.set(pts.reduce((a, p) => a + p.x, 0) / pts.length, 0, pts.reduce((a, p) => a + p.z, 0) / pts.length)
  }

  function toggleCollapsed(key: string) {
    ui.collapsedGroups = ui.collapsedGroups.includes(key) ? ui.collapsedGroups.filter((k) => k !== key) : [...ui.collapsedGroups, key]
  }

  function toggleLock(r: OutlineRow) {
    setLocked(editor.session, [r.id], !r.locked, editor.library)
    if (!r.locked) editor.selection.set(editor.selection.list().filter((id) => !targets(r).includes(id)))
  }

  // --- Rename -------------------------------------------------------------------------------
  let renaming: string | null = $state(null)
  let draft = $state('')
  async function startRename(r: OutlineRow) {
    renaming = r.id
    draft = editor.session.doc.getObject(r.id)?.props.get('name') as string ?? r.name
    await tick()
    const input = document.querySelector<HTMLInputElement>('.outliner .rename')
    input?.focus()
    input?.select()
  }
  function finishRename(save: boolean) {
    if (save && renaming) rename(editor.session, renaming, draft, editor.library)
    renaming = null
  }

  // --- Context menu -------------------------------------------------------------------------
  let menu: { row: OutlineRow; anchor: HTMLElement } | null = $state(null)
  function openMenu(e: MouseEvent, r: OutlineRow) {
    e.preventDefault()
    if (!isOn(r)) editor.selection.set(targets(r))
    menu = { row: r, anchor: e.currentTarget as HTMLElement }
  }
  function act(fn: () => void) {
    fn()
    menu = null
  }

  // --- Drag to reorder / move into a group ----------------------------------------------------
  let dragging: string | null = null
  let dropAt: { id: string; zone: 'before' | 'after' | 'into' } | null = $state(null)

  function zoneOf(e: DragEvent, r: OutlineRow): 'before' | 'after' | 'into' {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const f = (e.clientY - box.top) / box.height
    if (r.isGroup && f > 0.25 && f < 0.75) return 'into'
    return f < 0.5 ? 'before' : 'after'
  }

  /** `id` is `g` or inside it. */
  function within(id: string, g: string): boolean {
    for (let cur: string | null = id, n = 0; cur && n < 64; n++) {
      if (cur === g) return true
      const up = editor.session.doc.getProp(cur, 'group')
      cur = typeof up === 'string' ? up : null
    }
    return false
  }

  function onDragOver(e: DragEvent, r: OutlineRow) {
    if (!dragging || dragging === r.id) return
    const zone = zoneOf(e, r)
    if (zone === 'into' && within(r.id, dragging)) return // a group can't go inside itself
    e.preventDefault()
    dropAt = { id: r.id, zone }
  }

  function onDrop(e: DragEvent, r: OutlineRow) {
    e.preventDefault()
    const d = dragging
    const at = dropAt
    dragging = null
    dropAt = null
    if (!d || !at || d === r.id) return
    const doc = editor.session.doc
    const lib = editor.library
    const dName = objectName(doc.getObject(d)!, lib)
    // The first drag starts the custom order from the order currently shown.
    const shown = ui.outliner.sort
    if (at.zone === 'into') {
      const list = siblings(doc, lib, r.id, shown).filter((x) => x !== d)
      reorder(editor.session, [...list, d], r.id, `Move ${dName} into ${r.name}`)
      return
    }
    // Before / after a row: same level as that row (climbing out of "sitting on" nesting).
    let target = r.id
    for (let up = doc.getProp(target, 'parent'), n = 0; typeof up === 'string' && n < 64; up = doc.getProp(target, 'parent'), n++) target = up
    if (within(target, d)) return
    const group = (doc.getProp(target, 'group') as string | null) ?? null
    const list = siblings(doc, lib, group, shown).filter((x) => x !== d)
    const i = list.indexOf(target)
    list.splice(at.zone === 'before' ? i : i + 1, 0, d)
    const moved = (doc.getProp(d, 'group') ?? null) !== group
    reorder(editor.session, list, group, moved ? (group ? `Move ${dName} into ${objectName(doc.getObject(group)!, lib)}` : `Move ${dName} out of its group`) : `Reorder ${dName}`)
    ui.outliner.sort = 'custom'
  }

  // --- Settings -----------------------------------------------------------------------------
  let settingsButton: HTMLButtonElement = $state()!
  let settingsOpen = $state(false)
  const GROUP_BY: [OutlineGroupBy, string][] = [['type', 'Type'], ['category', 'Category'], ['none', 'None']]
  const SORTS: [OutlineSort, string][] = [['name', 'Name'], ['custom', 'Custom order'], ['newest', 'Newest first'], ['oldest', 'Oldest first']]
  const ICONS: Record<string, string> = { group: 'layers', building: 'building', water: 'droplet', prop: 'cube' }
</script>

<div class="outliner">
  <div class="toolbar">
    <SearchField bind:value={query} placeholder="Search objects" />
    <button class="icon" bind:this={settingsButton} title="View options" aria-label="View options"
      onclick={() => (settingsOpen = !settingsOpen)}><Icon name="sliders" /></button>
  </div>
  <div class="list" role="tree" aria-multiselectable="true">
    {#each sections as s (s.key)}
      {@const open = sectionOpen(s.key)}
      {#if s.label}
        <button class="group-head" onclick={() => toggleCollapsed(`os:${s.key}`)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} /><span>{s.label}</span><span class="count">{s.rows.filter((r) => r.depth === 0).length}</span>
        </button>
      {/if}
      {#if open}
        {#each s.rows as r (r.id)}
          {@const on = isOn(r)}
          <div class="row" class:on class:locked={r.locked || r.lockedBy} class:group={r.isGroup}
            class:drop-before={dropAt?.id === r.id && dropAt.zone === 'before'} class:drop-after={dropAt?.id === r.id && dropAt.zone === 'after'}
            class:drop-into={dropAt?.id === r.id && dropAt.zone === 'into'}
            style:padding-left="{6 + r.depth * 14}px" role="treeitem" aria-selected={on} tabindex="-1"
            draggable={renaming !== r.id} ondragstart={(e) => { dragging = r.id; e.dataTransfer?.setData('text/plain', r.name) }}
            ondragend={() => { dragging = null; dropAt = null }} ondragover={(e) => onDragOver(e, r)} ondragleave={() => dropAt?.id === r.id && (dropAt = null)}
            ondrop={(e) => onDrop(e, r)}
            onclick={(e) => pick(e, r)} ondblclick={() => (r.isGroup ? startRename(r) : focus(r))} oncontextmenu={(e) => openMenu(e, r)}
            onkeydown={(e) => e.key === 'Enter' && pick(e as unknown as MouseEvent, r)}>
            {#if r.count > 0}
              <button class="twist bare" aria-label={collapsed.has(r.id) ? 'Expand' : 'Collapse'} onclick={(e) => { e.stopPropagation(); toggleCollapsed(COLLAPSE + r.id) }}>
                <Icon name={collapsed.has(r.id) ? 'chevronRight' : 'chevronDown'} size={12} />
              </button>
            {:else}<span class="twist"></span>{/if}
            <Icon name={ICONS[r.type] ?? 'cube'} size={13} />
            {#if renaming === r.id}
              <input class="input rename" bind:value={draft} onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finishRename(true); else if (e.key === 'Escape') finishRename(false) }}
                onblur={() => finishRename(true)} />
            {:else}
              <span class="name">{r.name}</span>
              {#if r.isGroup && collapsed.has(r.id)}<span class="count">{r.count}</span>{/if}
            {/if}
            <button class="lock bare" class:shown={r.locked || r.lockedBy} disabled={r.lockedBy}
              title={r.lockedBy ? 'Locked by its group' : r.locked ? 'Unlock' : 'Lock'} aria-label={r.locked ? 'Unlock' : 'Lock'}
              onclick={(e) => { e.stopPropagation(); toggleLock(r) }}><Icon name={r.locked || r.lockedBy ? 'lock' : 'unlock'} size={12} /></button>
          </div>
        {/each}
      {/if}
    {:else}
      <p class="empty">{query ? `No objects match “${query}”` : 'The map is empty'}</p>
    {/each}
  </div>
</div>

{#if settingsOpen}
  <Popover anchor={settingsButton} width={240} onclose={() => (settingsOpen = false)}>
    <div class="pop">
      <label class="field stack"><span class="label">Group by</span>
        <select bind:value={ui.outliner.groupBy}>{#each GROUP_BY as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
      </label>
      <label class="field stack"><span class="label">Sort by</span>
        <select bind:value={ui.outliner.sort}>{#each SORTS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>
      </label>
    </div>
  </Popover>
{/if}

{#if menu}
  {@const r = menu.row}
  <Popover anchor={menu.anchor} width={200} onclose={() => (menu = null)}>
    <div class="menu-list" role="menu">
      <button role="menuitem" onclick={() => act(() => startRename(r))}>Rename</button>
      <button role="menuitem" disabled={!canGroup(editor)} onclick={() => act(() => groupSelected(editor))}>Group<span class="shortcut">{key('Mod+G')}</span></button>
      <button role="menuitem" disabled={!canUngroup(editor)} onclick={() => act(() => ungroupSelected(editor))}>Ungroup<span class="shortcut">{key('Mod+Shift+G')}</span></button>
      <button role="menuitem" onclick={() => act(() => toggleLockSelected(editor))}>{r.locked || r.lockedBy ? 'Unlock' : 'Lock'}<span class="shortcut">{key('Mod+Shift+L')}</span></button>
      <button role="menuitem" onclick={() => act(() => focus(r))}>Focus<span class="shortcut">{key('F')}</span></button>
      <div class="sep"></div>
      <button role="menuitem" class="danger-text" disabled={r.locked || r.lockedBy} onclick={() => act(() => selectTool().deleteSelection())}>Delete<span class="shortcut">{key('Del')}</span></button>
    </div>
  </Popover>
{/if}

<style>
  .outliner { display: flex; flex-direction: column; gap: 8px; padding: 10px; min-height: 0; flex: 1; }
  .toolbar { display: flex; gap: 6px; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
  /* Tree rows: the shared list-row look, with drag-and-drop indicators. */
  .row {
    position: relative; display: flex; align-items: center; gap: 5px; padding: 2px 4px 2px 6px; border-radius: var(--radius-sm);
    font-size: 12.5px; flex: none; cursor: default; min-height: 26px;
  }
  .row:hover { background: var(--hover); }
  .row.on { background: var(--accent-bg); color: var(--accent); }
  .row.group { font-weight: 500; }
  .row.locked .name { opacity: 0.55; }
  .row.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  .row.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .row.drop-into { outline: 1px solid var(--accent); }
  .twist { width: 14px; height: 14px; padding: 0; display: flex; align-items: center; justify-content: center; flex: none; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rename { flex: 1; padding: 2px 5px; border-radius: 5px; }
  .lock { padding: 3px; visibility: hidden; flex: none; }
  .row:hover .lock, .lock.shown { visibility: visible; }
  .lock.shown { color: var(--accent); }
  .lock:disabled { opacity: 0.6; }
</style>
