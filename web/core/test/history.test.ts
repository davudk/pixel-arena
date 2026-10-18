import { describe, expect, it } from 'vitest'
import { MapSession, Rect2i, terrainEdit, Vec2i, Vec3 } from '../src'

function setup() {
  const s = new MapSession('', 'alice')
  const place = (pos: Vec3) => {
    let id = ''
    s.edit('Place', () => (id = s.createObject('prop', { prop: 'core:tree', position: pos })))
    return id
  }
  const move = (id: string, pos: Vec3) => s.edit('Move', () => s.setProp(id, 'position', pos))
  const raise = (rect: Rect2i, h: number, label = 'Raise') =>
    s.edit(label, () => terrainEdit.heightOps(s.doc, rect, () => h).forEach((op) => s.apply(op)))
  return { s, place, move, raise }
}

describe('undo / redo', () => {
  it('undo redo create', () => {
    const { s, place } = setup()
    const id = place(new Vec3(1, 0, 1))
    expect(s.canUndo()).toBe(true)
    s.undo()
    expect(s.doc.hasObject(id)).toBe(false)
    expect(s.canRedo()).toBe(true)
    s.redo()
    expect(s.doc.hasObject(id)).toBe(true)
    expect(s.doc.getProp(id, 'position')).toEqual(new Vec3(1, 0, 1))
  })

  it('multi-op transaction undoes as one step', () => {
    const { s, place } = setup()
    const id = place(Vec3.ZERO)
    s.edit('Several', () => {
      s.setProp(id, 'position', new Vec3(1, 0, 0))
      s.setProp(id, 'position', new Vec3(2, 0, 0))
      s.setProp(id, 'scale', 3)
    })
    s.undo()
    expect(s.doc.getProp(id, 'position')).toEqual(Vec3.ZERO)
    expect(s.doc.getProp(id, 'scale')).toBeNull()
    s.redo()
    expect(s.doc.getProp(id, 'position')).toEqual(new Vec3(2, 0, 0))
    expect(s.doc.getProp(id, 'scale')).toBe(3)
  })

  it('sequential undo', () => {
    const { s, place, move } = setup()
    const id = place(Vec3.ZERO)
    move(id, new Vec3(1, 0, 0))
    move(id, new Vec3(2, 0, 0))
    s.undo()
    expect(s.doc.getProp(id, 'position')).toEqual(new Vec3(1, 0, 0))
    s.undo()
    expect(s.doc.getProp(id, 'position')).toEqual(Vec3.ZERO)
    s.undo()
    expect(s.doc.hasObject(id)).toBe(false)
    expect(s.canUndo()).toBe(false)
    expect(s.undo()).toBeNull()
  })

  it('new edit clears redo', () => {
    const { s, place, move } = setup()
    const id = place(Vec3.ZERO)
    move(id, new Vec3(1, 0, 0))
    s.undo()
    move(id, new Vec3(5, 0, 0))
    expect(s.canRedo()).toBe(false)
  })

  it('undo delete restores', () => {
    const { s, place } = setup()
    const id = place(new Vec3(4, 0, 4))
    s.edit('Delete', () => s.deleteObject(id))
    expect(s.doc.hasObject(id)).toBe(false)
    s.undo()
    expect(s.doc.hasObject(id)).toBe(true)
    expect(s.doc.objectsInChunk(Vec2i.ZERO)).toEqual([id])
  })

  it('empty transaction not recorded', () => {
    const { s } = setup()
    expect(s.edit('Nothing', () => {})).toBeNull()
    expect(s.canUndo()).toBe(false)
  })

  it('cancel reverts the open transaction', () => {
    const { s, place } = setup()
    const id = place(Vec3.ZERO)
    s.begin('Drag')
    s.setProp(id, 'position', new Vec3(9, 0, 9))
    s.createObject('prop', { position: new Vec3(50, 0, 50) })
    s.cancel()
    expect(s.doc.getProp(id, 'position')).toEqual(Vec3.ZERO)
    expect(s.doc.occupiedChunks().map((c) => c.key)).toEqual(['0,0'])
    expect(s.branch().txns).toHaveLength(1)
  })

  it('edit that throws is cancelled', () => {
    const { s, place } = setup()
    const id = place(Vec3.ZERO)
    expect(() =>
      s.edit('Boom', () => {
        s.setProp(id, 'scale', 5)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(s.doc.getProp(id, 'scale')).toBeNull()
    expect(s.isEditing()).toBe(false)
  })

  it('undo only reverts own transactions', () => {
    const { s, place } = setup()
    const a = place(Vec3.ZERO)
    s.authorId = 'bob'
    const b = place(new Vec3(2, 0, 0))
    s.authorId = 'alice'
    s.undo()
    expect(s.doc.hasObject(a)).toBe(false)
    expect(s.doc.hasObject(b)).toBe(true)
  })

  it('undo skips a property changed by someone else', () => {
    const { s, place, move } = setup()
    const id = place(Vec3.ZERO)
    s.edit('Edit', () => {
      s.setProp(id, 'position', new Vec3(1, 0, 0))
      s.setProp(id, 'variant', 'red')
    })
    s.authorId = 'bob'
    move(id, new Vec3(7, 0, 7))
    s.authorId = 'alice'
    const inv = s.undo()!
    expect(inv.skipped).toBe(1)
    expect(s.doc.getProp(id, 'position')).toEqual(new Vec3(7, 0, 7))
    expect(s.doc.getProp(id, 'variant')).toBeNull()
  })

  it('undo leaves an object deleted by someone else intact', () => {
    const { s, place } = setup()
    const id = place(new Vec3(3, 0, 3))
    s.authorId = 'bob'
    s.edit('Delete', () => s.deleteObject(id))
    s.authorId = 'alice'
    expect(s.undo()).toBeNull()
    expect(s.doc.hasObject(id)).toBe(false)
    s.authorId = 'bob'
    s.undo()
    expect(s.doc.hasObject(id)).toBe(true)
    expect(s.doc.getProp(id, 'position')).toEqual(new Vec3(3, 0, 3))
  })

  it('terrain undo is per cell', () => {
    const { s, raise } = setup()
    raise(new Rect2i(0, 0, 2, 1), 1)
    s.authorId = 'bob'
    raise(new Rect2i(1, 0, 1, 1), 5, 'Raise more')
    s.authorId = 'alice'
    s.undo()
    expect(terrainEdit.heightAt(s.doc, 0, 0)).toBe(0)
    expect(terrainEdit.heightAt(s.doc, 1, 0)).toBe(5)
    s.redo()
    expect(terrainEdit.heightAt(s.doc, 0, 0)).toBe(1)
    expect(terrainEdit.heightAt(s.doc, 1, 0)).toBe(5)
  })

  it('transactions get increasing lamport', () => {
    const { s, place, move } = setup()
    const id = place(Vec3.ZERO)
    move(id, new Vec3(1, 1, 1))
    const txns = s.branch().txns
    expect(txns).toHaveLength(2)
    expect(txns[1].lamport).toBeGreaterThan(txns[0].lamport)
    expect(txns[0].author).toBe('alice')
  })
})
