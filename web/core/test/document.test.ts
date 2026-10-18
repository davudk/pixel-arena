import { describe, expect, it, vi } from 'vitest'
import { codec, log, MapDocument, ops, SETTINGS_ID, terrainEdit, uuid, Vec2, Vec2i, Vec3, Rect2i } from '../src'
import { diff } from '../src/merge'

const fresh = () => new MapDocument()

describe('MapDocument', () => {
  it('uuid format', () => {
    const a = uuid()
    expect(a).toHaveLength(36)
    expect(a[14]).toBe('4')
    expect(a).not.toBe(uuid())
  })

  it('settings object exists', () => {
    const doc = fresh()
    expect(doc.hasObject(SETTINGS_ID)).toBe(true)
    doc.applyOp(ops.setProp(SETTINGS_ID, 'time_of_day', 0.5))
    expect(doc.getSetting('time_of_day')).toBe(0.5)
  })

  it('create, set, delete, restore', () => {
    const doc = fresh()
    doc.applyOp(ops.create('a', 'prop'))
    let applied = doc.applyOp(ops.setProp('a', 'position', new Vec3(1, 0, 2))) as ops.SetOp
    expect(applied.prev).toBeNull()
    applied = doc.applyOp(ops.setProp('a', 'position', new Vec3(5, 0, 5))) as ops.SetOp
    expect(applied.prev).toEqual(new Vec3(1, 0, 2))
    doc.applyOp(ops.del('a'))
    expect(doc.hasObject('a')).toBe(false)
    expect(doc.getObject('a')!.deleted).toBe(true)
    expect(doc.getProp('a', 'position')).toEqual(new Vec3(5, 0, 5)) // tombstone keeps props
    doc.applyOp(ops.restore('a'))
    expect(doc.hasObject('a')).toBe(true)
  })

  it('set null removes property', () => {
    const doc = fresh()
    doc.applyOp(ops.create('a', 'prop'))
    doc.applyOp(ops.setProp('a', 'variant', 'red'))
    doc.applyOp(ops.setProp('a', 'variant', null))
    expect(doc.getObject('a')!.props.has('variant')).toBe(false)
  })

  it('stored containers are copies', () => {
    const doc = fresh()
    doc.applyOp(ops.create('w', 'water'))
    const poly = [new Vec2(0, 0), new Vec2(1, 0)]
    doc.applyOp(ops.setProp('w', 'polygon', poly))
    poly.push(new Vec2(9, 9))
    expect((doc.getProp('w', 'polygon') as Vec2[]).length).toBe(2)
  })

  it('sparse chunks for far-apart objects', () => {
    const doc = fresh()
    doc.applyOp(ops.create('a', 'prop'))
    doc.applyOp(ops.setProp('a', 'position', new Vec3(1, 0, 1)))
    doc.applyOp(ops.create('b', 'prop'))
    doc.applyOp(ops.setProp('b', 'position', new Vec3(3200, 0, 3200)))
    const keys = doc.occupiedChunks().map((c) => c.key)
    expect(keys.sort()).toEqual(['0,0', '100,100'])
  })

  it('negative coordinates chunk', () => {
    expect(MapDocument.chunkOf(new Vec3(-0.5, 0, -32.5))).toEqual(new Vec2i(-1, -2))
  })

  it('index follows moves and deletes', () => {
    const doc = fresh()
    doc.applyOp(ops.create('a', 'prop'))
    doc.applyOp(ops.setProp('a', 'position', new Vec3(1, 0, 1)))
    doc.applyOp(ops.setProp('a', 'position', new Vec3(40, 0, 1)))
    expect(doc.objectsInChunk(new Vec2i(0, 0))).toEqual([])
    expect(doc.objectsInChunk(new Vec2i(1, 0))).toEqual(['a'])
    doc.applyOp(ops.del('a'))
    expect(doc.occupiedChunks()).toHaveLength(0)
    doc.applyOp(ops.restore('a'))
    expect(doc.objectsInChunk(new Vec2i(1, 0))).toEqual(['a'])
  })

  it('changed signal', () => {
    const doc = fresh()
    const seen: string[] = []
    doc.changed.connect((op) => seen.push(op.op))
    doc.applyOp(ops.create('a', 'prop'))
    doc.applyOp(ops.setProp('a', 'scale', 2))
    expect(seen).toEqual(['create', 'set'])
  })

  it('invalid ops are rejected', () => {
    const spy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const doc = fresh()
    expect(doc.applyOp(ops.setProp('missing', 'x', 1))).toBeNull()
    expect(doc.applyOp(ops.del(SETTINGS_ID))).toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('dict round trip through the Godot-compatible codec', () => {
    const doc = fresh()
    doc.applyOp(ops.create('a', 'prop'))
    doc.applyOp(ops.setProp('a', 'position', new Vec3(1.25, 2, -3)))
    doc.applyOp(ops.setProp('a', 'prop', 'core:campfire'))
    for (const op of terrainEdit.heightOps(doc, new Rect2i(0, 0, 2, 2), () => 1.5)) doc.applyOp(op)
    const copy = MapDocument.fromDict(codec.parse(codec.stringify(doc.toDict())) as never)
    expect(copy.mapId).toBe(doc.mapId)
    expect(diff(doc, copy).size).toBe(0)
    expect(copy.objectsInChunk(new Vec2i(0, -1))).toEqual(['a'])
  })
})
