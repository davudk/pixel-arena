// The set of selected object ids (port of Selection). Drops ids whose objects get deleted.

import { Signal, type MapDocument } from '@pixel-arena/core'

export class Selection {
  readonly changed = new Signal<void>()
  private ids = new Set<string>()
  private unbind: (() => void)[] = []

  bind(doc: MapDocument) {
    this.unbind.forEach((f) => f())
    this.unbind = [
      doc.changed.connect((op) => {
        if (op.op === 'delete' && this.ids.delete(op.id)) this.changed.emit()
      }),
      doc.reset.connect(() => this.clear()),
    ]
    this.clear()
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  get size(): number {
    return this.ids.size
  }

  list(): string[] {
    return [...this.ids]
  }

  set(ids: Iterable<string>) {
    this.ids = new Set(ids)
    this.changed.emit()
  }

  toggle(id: string) {
    if (!this.ids.delete(id)) this.ids.add(id)
    this.changed.emit()
  }

  clear() {
    if (this.ids.size === 0) return
    this.ids.clear()
    this.changed.emit()
  }
}
