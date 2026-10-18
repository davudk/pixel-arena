// Transactions (the unit of undo, history and sync) and branches (lines of history).

import { int, type Encodable } from './codec'
import type { Op } from './ops'
import type { Value } from './values'

export type TxnKind = 'edit' | 'undo' | 'redo' | 'merge'

export class Transaction {
  /** For undo/redo: the id of the transaction this one inverts. */
  target = ''
  branch = ''
  lamport = 0
  time = 0
  /** Applied ops (with `prev` filled in), in application order. */
  ops: Op[] = []
  /** For undo/redo: ops that couldn't be reverted because the data changed since. */
  skipped = 0

  constructor(
    readonly id: string,
    readonly author: string,
    readonly label: string,
    readonly kind: TxnKind = 'edit',
  ) {}

  toDict(): Encodable {
    return {
      id: this.id, author: this.author, label: this.label, kind: this.kind, target: this.target,
      branch: this.branch, lamport: int(this.lamport), time: this.time,
      ops: this.ops as unknown as Value[], skipped: int(this.skipped),
    }
  }

  static fromDict(d: Record<string, Value>): Transaction {
    const t = new Transaction(d.id as string, d.author as string, d.label as string, d.kind as TxnKind)
    t.target = (d.target as string) ?? ''
    t.branch = (d.branch as string) ?? ''
    t.lamport = (d.lamport as number) ?? 0
    t.time = (d.time as number) ?? 0
    t.ops = (d.ops as unknown as Op[]) ?? []
    t.skipped = (d.skipped as number) ?? 0
    return t
  }
}

/** A line of history. A branch's state = its parent's state after `forkSeq` transactions, plus
 *  its own transactions. The root branch ("main") has no parent. */
export class Branch {
  createdTime = Date.now() / 1000
  txns: Transaction[] = []
  /** Per-author stacks of transaction ids, newest last. Copied from the parent on fork so undo
   *  keeps working across a fork point. */
  undo: Record<string, string[]> = {}
  redo: Record<string, string[]> = {}

  constructor(
    readonly id: string,
    public name: string,
    readonly parentId = '',
    readonly forkSeq = 0,
  ) {}

  toDict(): Encodable {
    return {
      id: this.id, name: this.name, parent_id: this.parentId, fork_seq: int(this.forkSeq),
      created_time: this.createdTime, txns: this.txns.map((t) => t.toDict()),
      undo: this.undo, redo: this.redo,
    }
  }

  static fromDict(d: Record<string, Value>): Branch {
    const b = new Branch(d.id as string, d.name as string, (d.parent_id as string) ?? '', (d.fork_seq as number) ?? 0)
    b.createdTime = (d.created_time as number) ?? 0
    b.txns = ((d.txns as Record<string, Value>[]) ?? []).map(Transaction.fromDict)
    b.undo = (d.undo as Record<string, string[]>) ?? {}
    b.redo = (d.redo as Record<string, string[]>) ?? {}
    return b
  }
}
