<script lang="ts">
  // Branches & history (port of HistoryPanel). Top: the branch tree with New / Switch / Merge /
  // Rename / Discard. Bottom: the current branch's transactions, newest first, entries from
  // before the fork point dimmed; "Branch here" starts a branch at the selected entry. The panel
  // only asks; the app performs the operations (with dialogs where needed).
  import { onDestroy } from 'svelte'
  import { MAIN, type MapSession } from '@pixel-arena/core'
  import type { Editor } from '../editor/editor'

  interface Props {
    editor: Editor
    onnew: (fromBranch: string, seq: number) => void
    onmerge: (id: string) => void
    onrename: (id: string) => void
    ondiscard: (id: string) => void
  }
  let { editor, onnew, onmerge, onrename, ondiscard }: Props = $props()

  const PREFIX: Record<string, string> = { undo: '↶ Undo: ', redo: '↷ Redo: ', merge: '⇄ ', edit: '' }
  let rev = $state(0)
  let picked: string | null = $state(null)
  let entry: number | null = $state(null)

  let offHistory = () => {}
  function watch(s: MapSession) {
    offHistory()
    offHistory = s.historyChanged.connect(() => {
      rev++
      entry = null
    })
    picked = null
    entry = null
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
    const rows: { id: string; name: string; count: number; depth: number; current: boolean }[] = []
    const walk = (id: string, depth: number) => {
      const b = s.branches.get(id)!
      rows.push({ id, name: b.name, count: b.txns.length, depth, current: id === s.currentBranch })
      const kids = s.childrenOf(id).sort((a, c) => s.branches.get(a)!.createdTime - s.branches.get(c)!.createdTime)
      for (const k of kids) walk(k, depth + 1)
    }
    walk(MAIN, 0)
    const history = s.history(s.currentBranch, 300).map((e) => {
      const d = new Date(e.txn.time * 1000)
      return {
        label: `${PREFIX[e.txn.kind] ?? ''}${e.txn.label}`,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        tip: `${e.txn.label} · ${e.txn.ops.length} ops · by ${e.txn.author}${e.inherited ? ' (from parent branch)' : ''}`,
        inherited: e.inherited, branchId: e.branchId, seq: e.seq,
      }
    })
    return { rows, history, current: s.currentBranch, canUndo: s.canUndo(), canRedo: s.canRedo() }
  })

  const selected = $derived(picked ?? view.current)
  const isMain = $derived(selected === MAIN)
  const hasChildren = $derived.by(() => {
    rev
    return editor.session.childrenOf(selected).length > 0
  })
</script>

<div class="history">
  <h3 class="heading">Branches</h3>
    <ul class="branches">
      {#each view.rows as r (r.id)}
        <li>
          <button class="list-row" class:on={selected === r.id} class:current={r.current} style:padding-left="{6 + r.depth * 14}px"
            onclick={() => (picked = r.id)} ondblclick={() => editor.switchBranch(r.id)}>
            <span class="dot">{r.current ? '●' : ''}</span>{r.name}<span class="count">{r.count}</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button onclick={() => onnew(view.current, -1)} title="Branch from the current state">New</button>
      <button disabled={selected === view.current} onclick={() => editor.switchBranch(selected)} title="Show this branch (or double-click)">Switch</button>
      <button disabled={isMain || hasChildren} onclick={() => onmerge(selected)}
        title={hasChildren ? 'Merge or discard its sub-branches first' : 'Fold this branch into its parent'}>Merge</button>
      <button onclick={() => onrename(selected)}>Rename</button>
      <button disabled={isMain} onclick={() => ondiscard(selected)} title="Discard this branch and its sub-branches">Discard</button>
    </div>
    <h3 class="heading">Edits</h3>
    <ol class="list">
      {#each view.history as h, i (i)}
        <li>
          <button class="list-row" class:on={entry === i} class:inherited={h.inherited} title={h.tip} onclick={() => (entry = i)}>
            <span>{h.label}</span><time>{h.time}</time>
          </button>
        </li>
      {:else}
        <li class="empty">No edits yet</li>
      {/each}
    </ol>
    <div class="actions">
      <button disabled={!view.canUndo} onclick={() => editor.session.undo()}>Undo</button>
      <button disabled={!view.canRedo} onclick={() => editor.session.redo()}>Redo</button>
      <button disabled={entry === null} onclick={() => {
        const h = view.history[entry!]
        onnew(h.branchId, h.seq)
      }} title="Start a branch at the selected entry">Branch here</button>
    </div>
</div>

<style>
  .history { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  ul, ol { list-style: none; margin: 0; padding: 0; }
  .branches { max-height: 120px; overflow-y: auto; }
  .list-row { width: 100%; }
  .branches .dot { width: 10px; color: var(--accent); font-size: 10px; }
  .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .actions button { padding: 5px 4px; font-size: 12px; white-space: nowrap; }
  .list { flex: 1; min-height: 60px; overflow-y: auto; }
  .list .list-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list time { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .list .inherited { opacity: 0.45; }
  .empty { padding: 8px; }
</style>
