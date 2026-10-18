// Value types stored in the document. They mirror the Godot types the original core used, so
// .pxmap files stay compatible: Vector2/Vector2i/Vector3/Rect2i, packed float/byte arrays and
// PackedVector2Array. Vector-like values are immutable; containers are copied on store.

export class Vec2 {
  constructor(readonly x: number, readonly y: number) {}
  add(o: Vec2): Vec2 { return new Vec2(this.x + o.x, this.y + o.y) }
  sub(o: Vec2): Vec2 { return new Vec2(this.x - o.x, this.y - o.y) }
  length(): number { return Math.hypot(this.x, this.y) }
}

/** Integer 2D vector (Godot Vector2i): grid cells, chunk coordinates. */
export class Vec2i {
  constructor(readonly x: number, readonly y: number) {}
  static readonly ZERO = new Vec2i(0, 0)
  add(o: Vec2i): Vec2i { return new Vec2i(this.x + o.x, this.y + o.y) }
  sub(o: Vec2i): Vec2i { return new Vec2i(this.x - o.x, this.y - o.y) }
  scale(k: number): Vec2i { return new Vec2i(this.x * k, this.y * k) }
  min(o: Vec2i): Vec2i { return new Vec2i(Math.min(this.x, o.x), Math.min(this.y, o.y)) }
  max(o: Vec2i): Vec2i { return new Vec2i(Math.max(this.x, o.x), Math.max(this.y, o.y)) }
  equals(o: Vec2i): boolean { return this.x === o.x && this.y === o.y }
  /** Map key ("x,y"). */
  get key(): string { return `${this.x},${this.y}` }
  static fromKey(k: string): Vec2i {
    const [x, y] = k.split(',').map(Number)
    return new Vec2i(x, y)
  }
}

export class Vec3 {
  constructor(readonly x: number, readonly y: number, readonly z: number) {}
  static readonly ZERO = new Vec3(0, 0, 0)
  add(o: Vec3): Vec3 { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z) }
  sub(o: Vec3): Vec3 { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z) }
  scale(k: number): Vec3 { return new Vec3(this.x * k, this.y * k, this.z * k) }
  withY(y: number): Vec3 { return new Vec3(this.x, y, this.z) }
  distanceTo(o: Vec3): number { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z) }
}

/** Integer rectangle (Godot Rect2i): position + size, end exclusive. */
export class Rect2i {
  constructor(readonly x: number, readonly y: number, readonly w: number, readonly h: number) {}
  get endX(): number { return this.x + this.w }
  get endY(): number { return this.y + this.h }
  get area(): number { return this.w * this.h }
  encloses(r: Rect2i): boolean {
    return r.x >= this.x && r.y >= this.y && r.endX <= this.endX && r.endY <= this.endY
  }
}

/** Godot PackedVector2Array (e.g. water polygons). */
export class PackedVec2Array {
  constructor(readonly points: readonly Vec2[]) {}
}

export type Value =
  | null
  | boolean
  | number
  | string
  | Vec2
  | Vec2i
  | Vec3
  | Rect2i
  | PackedVec2Array
  | Float32Array
  | Uint8Array
  | Value[]
  | { [key: string]: Value }

/** Deep equality of stored values. Numbers compare by value (JS has no int/float split). */
export function same(a: Value | undefined, b: Value | undefined): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a.constructor !== b.constructor) return false
  if (a instanceof Vec2 || a instanceof Vec2i) return a.x === (b as Vec2).x && a.y === (b as Vec2).y
  if (a instanceof Vec3) return a.x === (b as Vec3).x && a.y === (b as Vec3).y && a.z === (b as Vec3).z
  if (a instanceof Rect2i) {
    const r = b as Rect2i
    return a.x === r.x && a.y === r.y && a.w === r.w && a.h === r.h
  }
  if (a instanceof PackedVec2Array) {
    const p = (b as PackedVec2Array).points
    return a.points.length === p.length && a.points.every((v, i) => same(v, p[i]))
  }
  if (a instanceof Float32Array || a instanceof Uint8Array) {
    const t = b as Float32Array | Uint8Array
    if (a.length !== t.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== t[i]) return false
    return true
  }
  if (Array.isArray(a)) {
    const t = b as Value[]
    return a.length === t.length && a.every((v, i) => same(v, t[i]))
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b as object, k) && same((a as Record<string, Value>)[k], (b as Record<string, Value>)[k]))
}

/** Copy containers so stored values can't be mutated through a caller's reference. */
export function copy<T extends Value>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof Float32Array) return new Float32Array(v) as T
  if (v instanceof Uint8Array) return new Uint8Array(v) as T
  if (Array.isArray(v)) return v.map((x) => copy(x)) as T
  if (v.constructor === Object) {
    const out: Record<string, Value> = {}
    for (const [k, x] of Object.entries(v)) out[k] = copy(x)
    return out as T
  }
  return v // immutable value classes
}

/** Floor division that matches GDScript's floori(a / b) for negative numbers. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

/** Always-positive modulo (GDScript posmod). */
export function posmod(a: number, b: number): number {
  return ((a % b) + b) % b
}
