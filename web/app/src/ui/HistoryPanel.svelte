<script lang="ts">
  // Branches and history, the body of the History dialog (top bar, ⇧⌘H). Left: the branch tree
  // (+ starts a branch from the current state; double-click a branch to show it; its … menu
  // switches, renames, merges it into its parent or discards it). Right: the current branch's
  // edits, newest first, the ones from before the fork point dimmed; hovering an edit offers
  // "Branch here". The panel only asks; the app performs the operations (with dialogs).
  import { onDestroy } from 'svelte'
  import { MAIN, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'
  import Icon from './Icon.svelte'
  import Popover from './Popover.svelte'
  import { withKey } from './keys'

  interface Props {
    editor: Editor
    onnew: (fromBranch: string, seq: number) => void
    onmerge: (id: string) => void
    onrename: (id: string) => void
    ondiscard: (id: string) => void
  }
  let { editor, onnew, onmerge, onrename, ondiscard }: Props = $props()

  const ICON: Record<string, string> = { undo: 'undo', redo: 'redo', merge: 'merge' }
  let rev = $state(0)

  let offHistory = () => {}
  function watch(s: MapSession) {
    offHistory()
    offHistory = s.historyChanged.connect(() => rev++)
    rev++
  }
  watch(editor.session)
  const offSession = editor.sessionChanged.connect(watch)
  onDestroy(() => {
    offHistory()
    offSession()
  })

  const view = $derived.by(() => {
    rev // dependency
    const s = editor.session
    const rows: { id: string; name: string; count: number; depth: number; current: boolean; main: boolean; children: boolean }[] = []
    const walk = (id: string, depth: number) => {
      const b = s.branches.get(id)!
      const kids = s.childrenOf(id).sort((a, c) => s.branches.get(a)!.createdTime - s.branches.get(c)!.createdTime)
      rows.push({ id, name: b.name, count: b.txns.length, depth, current: id === s.currentBranch, main: id === MAIN, children: kids.length > 0 })
      for (const k of kids) walk(k, depth + 1)
    }
    walk(MAIN, 0)
    const history = s.history(s.currentBranch, 300).map((e) => {
      const d = new Date(e.txn.time * 1000)
      return {
        label: e.txn.label, icon: ICON[e.txn.kind] ?? null,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        tip: `${e.txn.label} · ${e.txn.ops.length} ops · by ${e.txn.author}${e.inherited ? ' (from parent branch)' : ''}`,
        inherited: e.inherited, branchId: e.branchId, seq: e.seq,
      }
    })
    return { rows, history, current: s.currentBranch, canUndo: s.canUndo(), canRedo: s.canRedo() }
  })

  let menu: { row: (typeof view.rows)[number]; anchor: HTMLElement } | null = $state(null)
  function act(fn: () => void) {
    menu = null
    fn()
  }
</script>

<div class="history">
  <section class="col">
    <div class="heading-row">
      <h3 class="heading">Branches</h3><span class="count">{view.rows.length}</span>
      <button class="icon" aria-label="New branch" title="New branch from the current state" onclick={() => onnew(view.current, -1)}><Icon name="plus" /></button>
    </div>
    <ul class="branches">
      {#each view.rows as r (r.id)}
        <li>
          <div class="list-row" class:on={r.current} style:padding-left="{6 + r.depth * 14}px" title={r.current ? 'Shown now' : 'Double-click to show this branch'}
            role="button" tabindex="-1" ondblclick={() => editor.switchBranch(r.id)} onkeydown={(e) => e.key === 'Enter' && editor.switchBranch(r.id)}>
            <Icon name="branch" size={13} /><span class="name">{r.name}</span><span class="count">{r.count}</span>
            <button class="bare more" class:shown={menu?.row.id === r.id} aria-label="Branch actions for {r.name}"
              onclick={(e) => (menu = { row: r, anchor: e.currentTarget as HTMLElement })}><Icon name="more" size={14} /></button>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section class="col">
    <div class="heading-row">
      <h3 class="heading">Edits</h3>
      <button class="icon" aria-label="Undo" title={withKey('Undo', 'Mod+Z')} disabled={!view.canUndo} onclick={() => editor.session.undo()}><Icon name="undo" /></button>
      <button class="icon" aria-label="Redo" title={withKey('Redo', 'Mod+Shift+Z')} disabled={!view.canRedo} onclick={() => editor.session.redo()}><Icon name="redo" /></button>
    </div>
    <ol class="list">
      {#each view.history as h, i (i)}
        <li>
          <div class="list-row" class:inherited={h.inherited} title={h.tip}>
            {#if h.icon}<Icon name={h.icon} size={13} />{/if}
            <span class="name">{h.label}</span><time>{h.time}</time>
            <button class="bare more" aria-label="Branch here" title="Start a branch at this edit" onclick={() => onnew(h.branchId, h.seq)}><Icon name="branch" size={13} /></button>
          </div>
        </li>
      {:else}
        <li><p class="empty">No edits yet</p></li>
      {/each}
    </ol>
  </section>
</div>

{#if menu}
  {@const r = menu.row}
  <Popover anchor={menu.anchor} width={200} onclose={() => (menu = null)}>
    <div class="menu-list" role="menu">
      <button role="menuitem" disabled={r.current} onclick={() => act(() => editor.switchBranch(r.id))}>Show this branch</button>
      <button role="menuitem" onclick={() => act(() => onrename(r.id))}>Rename…</button>
      <button role="menuitem" disabled={r.main || r.children} title={r.children ? 'Merge or discard its sub-branches first' : ''}
        onclick={() => act(() => onmerge(r.id))}>Merge into parent…</button>
      <div class="sep"></div>
      <button role="menuitem" class="danger-text" disabled={r.main} onclick={() => act(() => ondiscard(r.id))}>Discard…</button>
    </div>
  </Popover>
{/if}

<style>
  .history { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 16px; height: min(60vh, 520px); }
  .col { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  ul, ol { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; }
  .list-row { width: 100%; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { margin-left: 0; }
  time { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .inherited { opacity: 0.45; }
  .more { flex: none; padding: 2px; visibility: hidden; }
  .list-row:hover .more, .more.shown { visibility: visible; }
</style>
