// Owns the live MapDocument and its full history: branches of transactions, per-author
// undo/redo, and fork / switch / merge / discard. All edits go through begin() ... commit().
//
// Undo is per author and selective: it appends a new transaction that inverts the author's own
// last transaction, skipping anything someone else has changed since (see ops.inverse). In
// single player this behaves like ordinary undo.

import type { Encodable } from './codec'
import { int } from './codec'
import { Branch, Transaction, type TxnKind } from './history'
import { MapDocument } from './map-document'
import * as merge from './merge'
import { create, del, inverse, setProp, type Op } from './ops'
import { Signal, uuid } from './signal'
import type { Value } from './values'

export const MAIN = 'main'

export interface HistoryEntry {
  txn: Transaction
  branchId: string
  seq: number
  inherited: boolean
}

export class MapSession {
  readonly historyChanged = new Signal<void>()
  readonly branchSwitched = new Signal<string>()
  /** The live document. Same instance for the session's lifetime; switching branches replaces
   *  its contents and emits its `reset` signal. */
  readonly doc: MapDocument
  authorId: string
  branches = new Map<string, Branch>()
  currentBranch = MAIN
  lamport = 0

  private txns = new Map<string, Transaction>()
  private open: Transaction | null = null

  constructor(mapId = '', authorId = 'local') {
    this.doc = new MapDocument(mapId)
    this.authorId = authorId
    this.branches.set(MAIN, new Branch(MAIN, 'Main'))
  }

  branch(): Branch {
    return this.branches.get(this.currentBranch)!
  }

  getTransaction(id: string): Transaction | undefined {
    return this.txns.get(id)
  }

  // --- Editing ---------------------------------------------------------------------------

  begin(label: string): void {
    if (this.open) throw new Error('MapSession.begin: a transaction is already open')
    this.open = new Transaction(uuid(), this.authorId, label)
  }

  isEditing(): boolean {
    return this.open !== null
  }

  /** Applies a primitive op inside the open transaction. Returns the applied op or null. */
  apply(op: Op): Op | null {
    if (!this.open) throw new Error('MapSession.apply: no open transaction')
    const applied = this.doc.applyOp(op)
    if (applied) this.open.ops.push(applied)
    return applied
  }

  createObject(type: string, props: Record<string, Value> = {}): string {
    const id = uuid()
    if (!this.apply(create(id, type))) return ''
    for (const [path, value] of Object.entries(props)) this.apply(setProp(id, path, value))
    return id
  }

  setProp(id: string, path: string, value: Value): void {
    this.apply(setProp(id, path, value))
  }

  deleteObject(id: string): void {
    this.apply(del(id))
  }

  /** Records the open transaction. Returns it, or null if it made no changes. */
  commit(): Transaction | null {
    const txn = this.open
    this.open = null
    if (!txn || txn.ops.length === 0) return null
    this.record(txn)
    this.stack(this.branch().undo).push(txn.id)
    this.stack(this.branch().redo).length = 0
    this.historyChanged.emit()
    return txn
  }

  /** Reverts and drops the open transaction. */
  cancel(): void {
    if (!this.open) return
    for (let i = this.open.ops.length - 1; i >= 0; i--) {
      const inv = inverse(this.doc, this.open.ops[i])
      if (inv) this.doc.applyOp(inv)
    }
    this.open = null
  }

  /** begin(label), fn(), commit(). */
  edit(label: string, fn: () => void): Transaction | null {
    this.begin(label)
    try {
      fn()
    } catch (e) {
      this.cancel()
      throw e
    }
    return this.commit()
  }

  // --- Undo / redo -----------------------------------------------------------------------

  canUndo(): boolean {
    return (this.branch().undo[this.authorId] ?? []).length > 0
  }

  canRedo(): boolean {
    return (this.branch().redo[this.authorId] ?? []).length > 0
  }

  /** Reverts this author's last transaction. Returns the inverse transaction, or null if there
   *  was nothing to undo or everything had since been changed by someone else. */
  undo(): Transaction | null {
    this.assertClosed('undo')
    const stack = this.stack(this.branch().undo)
    const id = stack.pop()
    if (id === undefined) return null
    const inv = this.invert(this.txns.get(id)!, 'undo')
    if (inv) this.stack(this.branch().redo).push(inv.id)
    this.historyChanged.emit()
    return inv
  }

  redo(): Transaction | null {
    this.assertClosed('redo')
    const stack = this.stack(this.branch().redo)
    const id = stack.pop()
    if (id === undefined) return null
    const inv = this.invert(this.txns.get(id)!, 'redo')
    if (inv) this.stack(this.branch().undo).push(inv.id)
    this.historyChanged.emit()
    return inv
  }

  private invert(target: Transaction, kind: TxnKind): Transaction | null {
    const txn = new Transaction(uuid(), this.authorId, target.label, kind)
    txn.target = target.id
    // Reverse order, applying as we go: each check must see the earlier reverts.
    for (let i = target.ops.length - 1; i >= 0; i--) {
      const inv = inverse(this.doc, target.ops[i])
      if (!inv) {
        txn.skipped++
        continue
      }
      const applied = this.doc.applyOp(inv)
      if (applied) txn.ops.push(applied)
    }
    if (txn.ops.length === 0) return null
    this.record(txn)
    return txn
  }

  // --- Branches --------------------------------------------------------------------------

  /** Starts a new branch at the current state and switches to it. Returns its id. */
  fork(name: string): string {
    this.assertClosed('fork')
    const parent = this.branch()
    const b = new Branch(uuid(), name, parent.id, parent.txns.length)
    b.undo = structuredClone(parent.undo)
    b.redo = structuredClone(parent.redo)
    this.branches.set(b.id, b)
    this.currentBranch = b.id
    this.historyChanged.emit()
    this.branchSwitched.emit(b.id)
    return b.id
  }

  /** Starts a branch from an earlier point of `branchId` (after its first `seq` transactions)
   *  and switches to it. Undo history starts empty on such a branch. Returns its id. */
  forkAt(name: string, branchId: string, seq: number): string {
    this.assertClosed('forkAt')
    if (branchId === this.currentBranch && seq === this.branch().txns.length) return this.fork(name)
    const parent = this.branches.get(branchId)!
    const b = new Branch(uuid(), name, parent.id, Math.max(0, Math.min(seq, parent.txns.length)))
    this.branches.set(b.id, b)
    this.doc.loadState(this.materialize(b.id))
    this.currentBranch = b.id
    this.historyChanged.emit()
    this.branchSwitched.emit(b.id)
    return b.id
  }

  renameBranch(id: string, name: string): void {
    const b = this.branches.get(id)
    if (b && name.trim() !== '') {
      b.name = name.trim()
      this.historyChanged.emit()
    }
  }

  /** Transactions that make up a branch's state, newest first: its own, then its ancestors' up
   *  to each fork point. At most `limit` entries. */
  history(branchId: string, limit = 500): HistoryEntry[] {
    const out: HistoryEntry[] = []
    let id = branchId
    let upto = -1
    while (id !== '' && out.length < limit) {
      const b = this.branches.get(id)!
      const n = upto < 0 ? b.txns.length : upto
      for (let i = n - 1; i >= 0 && out.length < limit; i--)
        out.push({ txn: b.txns[i], branchId: id, seq: i + 1, inherited: id !== branchId })
      upto = b.forkSeq
      id = b.parentId
    }
    return out
  }

  switchBranch(id: string): void {
    this.assertClosed('switchBranch')
    if (id === this.currentBranch || !this.branches.has(id)) return
    this.doc.loadState(this.materialize(id))
    this.currentBranch = id
    this.historyChanged.emit()
    this.branchSwitched.emit(id)
  }

  childrenOf(id: string): string[] {
    return [...this.branches.values()].filter((b) => b.parentId === id).map((b) => b.id)
  }

  /** Deletes a branch and every branch forked from it. If the current branch is among them,
   *  switches to the discarded branch's parent first. Main can't be discarded. */
  discardBranch(id: string): boolean {
    if (id === MAIN || !this.branches.has(id)) return false
    if (this.descendsFrom(this.currentBranch, id)) this.switchBranch(this.branches.get(id)!.parentId)
    for (const child of this.childrenOf(id)) this.discardBranch(child)
    for (const txn of this.branches.get(id)!.txns) this.txns.delete(txn.id)
    this.branches.delete(id)
    this.historyChanged.emit()
    return true
  }

  /** What merging `sourceId` into its parent would change, including conflicts. */
  mergePlan(sourceId: string): merge.MergePlan {
    const src = this.branches.get(sourceId)!
    const base = this.materialize(src.parentId, src.forkSeq)
    return merge.plan(base, this.head(src.parentId), this.head(sourceId))
  }

  /** Merges a branch into its parent as one undoable transaction, then discards the branch.
   *  Leaves the parent as the current branch. Branches with sub-branches can't be merged. */
  mergeBranch(sourceId: string, resolutions: Record<string, merge.Resolution> = {}, fallback: merge.Resolution = merge.THEIRS): Transaction | null {
    this.assertClosed('mergeBranch')
    const src = this.branches.get(sourceId)
    if (sourceId === MAIN || !src || this.childrenOf(sourceId).length > 0) return null
    const p = this.mergePlan(sourceId)
    this.switchBranch(src.parentId)
    const txn = new Transaction(uuid(), this.authorId, `Merge ${src.name}`, 'merge')
    for (const op of merge.opsFor(this.doc, p, resolutions, fallback)) {
      const applied = this.doc.applyOp(op)
      if (applied) txn.ops.push(applied)
    }
    this.discardBranch(sourceId)
    if (txn.ops.length === 0) return null
    this.record(txn)
    this.stack(this.branch().undo).push(txn.id)
    this.stack(this.branch().redo).length = 0
    this.historyChanged.emit()
    return txn
  }

  /** Rebuilds the live document from history (e.g. after loading without a usable snapshot). */
  rebuildDocument(): void {
    this.doc.loadState(this.materialize(this.currentBranch))
  }

  /** State of `id` after its first `upto` transactions (all if -1), replayed from the root. */
  materialize(id: string, upto = -1): MapDocument {
    const b = this.branches.get(id)!
    const out = b.parentId === '' ? new MapDocument(this.doc.mapId) : this.materialize(b.parentId, b.forkSeq)
    const n = upto < 0 ? b.txns.length : upto
    for (let i = 0; i < n; i++) for (const op of b.txns[i].ops) out.applyOp(op)
    return out
  }

  private head(id: string): MapDocument {
    return id === this.currentBranch ? this.doc : this.materialize(id)
  }

  private descendsFrom(id: string, ancestor: string): boolean {
    while (id !== '') {
      if (id === ancestor) return true
      id = this.branches.get(id)!.parentId
    }
    return false
  }

  private record(txn: Transaction): void {
    this.lamport++
    txn.lamport = this.lamport
    txn.branch = this.currentBranch
    txn.time = Date.now() / 1000
    this.branch().txns.push(txn)
    this.txns.set(txn.id, txn)
  }

  private stack(stacks: Record<string, string[]>): string[] {
    return (stacks[this.authorId] ??= [])
  }

  private assertClosed(what: string): void {
    if (this.open) throw new Error(`MapSession.${what}: transaction open`)
  }

  // --- Serialization ---------------------------------------------------------------------

  historyToDict(): Encodable {
    return {
      current_branch: this.currentBranch,
      lamport: int(this.lamport),
      branches: [...this.branches.values()].map((b) => b.toDict()),
    }
  }

  loadHistory(d: Record<string, Value>): void {
    this.branches.clear()
    this.txns.clear()
    for (const bd of d.branches as Record<string, Value>[]) {
      const b = Branch.fromDict(bd)
      this.branches.set(b.id, b)
      for (const t of b.txns) this.txns.set(t.id, t)
    }
    this.currentBranch = d.current_branch as string
    this.lamport = d.lamport as number
  }
}
