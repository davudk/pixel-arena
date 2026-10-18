// One placed thing on the map (prop, building, water body, the settings record, ...). Its state
// is a flat bag of properties addressed by path, e.g. "position" or "floors/0/walls/3,4,N", so
// concurrent edits and merges work per property.
//
// Common prop paths: prop ("pack:id"), position (Vec3), rotation (yaw, radians), scale,
// parent (uuid), variant, anim_offset.

import type { Value } from './values'

export class MapObject {
  /** Tombstone: deleted objects keep their props so the delete can be undone or merged. */
  deleted = false
  props = new Map<string, Value>()

  constructor(readonly id: string, readonly type: string) {}

  get<T extends Value = Value>(path: string, fallback: T | null = null): T | null {
    return this.props.has(path) ? (this.props.get(path) as T) : fallback
  }

  toDict(): Record<string, Value> {
    return { id: this.id, type: this.type, deleted: this.deleted, props: Object.fromEntries(this.props) }
  }

  static fromDict(d: Record<string, Value>): MapObject {
    const obj = new MapObject(d.id as string, d.type as string)
    obj.deleted = Boolean(d.deleted)
    obj.props = new Map(Object.entries((d.props ?? {}) as Record<string, Value>))
    return obj
  }
}
