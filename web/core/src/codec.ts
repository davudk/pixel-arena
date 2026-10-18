// JSON encoding compatible with Godot's JSON.from_native / to_native, which the Godot build used
// for .pxmap files:
//   strings "s:text" (StringName "sn:text"), ints "i:1", floats "f:0.5", bools / null as-is,
//   Godot types {"type": "Vector3", "args": [...]}, dictionaries {"type": "Dictionary",
//   "args": [key, value, ...]}, plain arrays as JSON arrays, typed arrays with "elem_type".
// JavaScript numbers carry no int/float distinction: generic numbers encode as floats and
// schema code marks integers explicitly with `int()`.

import { PackedVec2Array, Rect2i, Vec2, Vec2i, Vec3, type Value } from './values'

/** Marks a number to be written as an int ("i:"). Only used while building JSON. */
export class Int {
  constructor(readonly value: number) {}
}

export function int(n: number): Int {
  return new Int(Math.trunc(n))
}

/** Anything encode() accepts: stored values plus Int markers inside plain containers. */
export type Encodable = Value | Int | Encodable[] | { [key: string]: Encodable }

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export function encode(v: Encodable): Json {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return `f:${floatText(v)}`
  if (typeof v === 'string') return `s:${v}`
  if (v instanceof Int) return `i:${v.value}`
  if (v instanceof Vec3) return { type: 'Vector3', args: [v.x, v.y, v.z] }
  if (v instanceof Vec2i) return { type: 'Vector2i', args: [v.x, v.y] }
  if (v instanceof Vec2) return { type: 'Vector2', args: [v.x, v.y] }
  if (v instanceof Rect2i) return { type: 'Rect2i', args: [v.x, v.y, v.w, v.h] }
  if (v instanceof PackedVec2Array) return { type: 'PackedVector2Array', args: v.points.flatMap((p) => [p.x, p.y]) }
  if (v instanceof Float32Array) return { type: 'PackedFloat32Array', args: Array.from(v) }
  if (v instanceof Uint8Array) return { type: 'PackedByteArray', args: Array.from(v) }
  if (Array.isArray(v)) return v.map(encode)
  const args: Json[] = []
  for (const [k, x] of Object.entries(v)) args.push(`s:${k}`, encode(x as Encodable))
  return { type: 'Dictionary', args }
}

export function decode(j: unknown): Value {
  if (j === null || j === undefined) return null
  if (typeof j === 'boolean') return j
  if (typeof j === 'number') return j
  if (typeof j === 'string') return decodeScalar(j)
  if (Array.isArray(j)) return j.map(decode)
  const o = j as { type?: string; args?: unknown[] }
  const a = (o.args ?? []) as number[]
  switch (o.type) {
    case 'Vector3': return new Vec3(a[0], a[1], a[2])
    case 'Vector2': return new Vec2(a[0], a[1])
    case 'Vector2i': return new Vec2i(a[0], a[1])
    case 'Rect2i': return new Rect2i(a[0], a[1], a[2], a[3])
    case 'PackedFloat32Array': return new Float32Array(a)
    case 'PackedByteArray': return new Uint8Array(a)
    case 'PackedVector2Array': {
      const pts: Vec2[] = []
      for (let i = 0; i + 1 < a.length; i += 2) pts.push(new Vec2(a[i], a[i + 1]))
      return new PackedVec2Array(pts)
    }
    case 'Array': return (o.args ?? []).map(decode)
    case 'Dictionary': {
      const out: Record<string, Value> = {}
      const args = o.args ?? []
      for (let i = 0; i + 1 < args.length; i += 2) out[keyText(decode(args[i]))] = decode(args[i + 1])
      return out
    }
  }
  throw new Error(`codec: unsupported value ${JSON.stringify(j).slice(0, 80)}`)
}

export function stringify(v: Encodable): string {
  return JSON.stringify(encode(v))
}

export function parse(text: string): Value {
  return decode(JSON.parse(text))
}

function decodeScalar(s: string): Value {
  const colon = s.indexOf(':')
  const tag = colon < 0 ? '' : s.slice(0, colon)
  const rest = s.slice(colon + 1)
  switch (tag) {
    case 's':
    case 'sn':
      return rest
    case 'i':
    case 'f':
      return Number(rest)
  }
  return s
}

function keyText(k: Value): string {
  if (typeof k === 'string') return k
  if (k instanceof Vec2i || k instanceof Vec2) return `${k.x},${k.y}`
  return String(k)
}

function floatText(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  const s = String(n)
  return /[.eE]/.test(s) ? s : `${s}.0`
}
