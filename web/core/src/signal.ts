/** Minimal typed event (stand-in for Godot signals). connect() returns a disconnect function. */
export class Signal<T = void> {
  private listeners = new Set<(value: T) => void>()

  connect(fn: (value: T) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(value: T): void {
    for (const fn of [...this.listeners]) fn(value)
  }
}

/** Random (version 4) UUID. */
export function uuid(): string {
  return crypto.randomUUID()
}
