import { describe, expect, it } from 'vitest'
import { MAIN, MapSession, merge, Rect2i, terrainEdit, Vec3, type Value } from '../src'

function setup() {
  const s = new MapSession()
  const place = (pos: Vec3) => {
    let id = ''
    s.edit('Place', () => (id = s.createObject('prop', { prop: 'core:tree', position: pos })))
    return id
  }
  const set = (id: string, path: string, value: Value) => s.edit(`Set ${path}`, () => s.setProp(id, path, value))
  const raise = (rect: Rect2i, h: number) =>
    s.edit('Raise', () => terrainEdit.heightOps(s.doc, rect, () => h).forEach((op) => s.apply(op)))
  /** The live document must always equal a replay of the branch's history. */
  const matchesHistory = () => expect(merge.diff(s.doc, s.materialize(s.currentBranch)).size).toBe(0)
  return { s, place, set, raise, matchesHistory }
}

describe('branches', () => {
  it('fork, switch and back', () => {
    const { s, place, set, matchesHistory } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Experiment')
    set(a, 'variant', 'red')
    const c = place(new Vec3(100, 0, 0))
    s.switchBranch(MAIN)
    expect(s.doc.getProp(a, 'variant')).toBeNull()
    expect(s.doc.hasObject(c)).toBe(false)
    s.switchBranch(b)
    expect(s.doc.getProp(a, 'variant')).toBe('red')
    expect(s.doc.hasObject(c)).toBe(true)
    matchesHistory()
  })

  it('switch emits reset', () => {
    const { s, place } = setup()
    place(Vec3.ZERO)
    s.fork('x')
    let resets = 0
    s.doc.reset.connect(() => resets++)
    s.switchBranch(MAIN)
    expect(resets).toBe(1)
  })

  it('discard branch', () => {
    const { s, place } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Throwaway')
    s.edit('Delete', () => s.deleteObject(a))
    const nested = s.fork('Nested')
    expect(s.discardBranch(b)).toBe(true)
    expect(s.currentBranch).toBe(MAIN)
    expect(s.branches.has(b)).toBe(false)
    expect(s.branches.has(nested)).toBe(false)
    expect(s.doc.hasObject(a)).toBe(true)
    expect(s.discardBranch(MAIN)).toBe(false)
  })

  it('undo works across the fork point', () => {
    const { s, place } = setup()
    const a = place(Vec3.ZERO)
    s.fork('x')
    s.undo()
    expect(s.doc.hasObject(a)).toBe(false)
    s.switchBranch(MAIN)
    expect(s.doc.hasObject(a)).toBe(true)
  })

  it('merge without conflicts', () => {
    const { s, place, set, raise, matchesHistory } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Feature')
    set(a, 'variant', 'red')
    const created = place(new Vec3(64, 0, 0))
    raise(new Rect2i(0, 0, 3, 3), 2)
    s.switchBranch(MAIN)
    set(a, 'scale', 2)
    expect(s.mergePlan(b).conflicts).toHaveLength(0)
    expect(s.mergeBranch(b)).not.toBeNull()
    expect(s.currentBranch).toBe(MAIN)
    expect(s.branches.has(b)).toBe(false)
    expect(s.doc.getProp(a, 'variant')).toBe('red')
    expect(s.doc.getProp(a, 'scale')).toBe(2)
    expect(s.doc.hasObject(created)).toBe(true)
    expect(s.doc.getProp(created, 'position')).toEqual(new Vec3(64, 0, 0))
    expect(terrainEdit.heightAt(s.doc, 2, 2)).toBe(2)
    matchesHistory()
  })

  it('merge from inside the branch', () => {
    const { s, place } = setup()
    const b = s.fork('Feature')
    const created = place(new Vec3(1, 0, 1))
    s.mergeBranch(b)
    expect(s.currentBranch).toBe(MAIN)
    expect(s.doc.hasObject(created)).toBe(true)
  })

  it('merge is one undo step', () => {
    const { s, place, set, matchesHistory } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Feature')
    set(a, 'variant', 'red')
    place(new Vec3(5, 0, 5))
    s.switchBranch(MAIN)
    s.mergeBranch(b)
    s.undo()
    expect(s.doc.getProp(a, 'variant')).toBeNull()
    expect(s.doc.occupiedChunks()).toHaveLength(1)
    expect(s.doc.hasObject(a)).toBe(true)
    matchesHistory()
  })

  it('conflicts resolved mine and theirs', () => {
    const { s, place, set } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Feature')
    set(a, 'variant', 'red')
    set(a, 'scale', 3)
    s.switchBranch(MAIN)
    set(a, 'variant', 'blue')
    set(a, 'scale', 0.5)
    const p = s.mergePlan(b)
    expect(p.conflicts).toHaveLength(2)
    const variant = p.conflicts.find((c) => c.kind === 'prop' && c.path === 'variant')!
    expect(variant.mine).toBe('blue')
    expect(variant.theirs).toBe('red')
    s.mergeBranch(b, { [variant.key]: merge.MINE }, merge.THEIRS)
    expect(s.doc.getProp(a, 'variant')).toBe('blue')
    expect(s.doc.getProp(a, 'scale')).toBe(3)
  })

  it('the same change on both sides is not a conflict', () => {
    const { s, place, set } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Feature')
    set(a, 'variant', 'red')
    s.switchBranch(MAIN)
    set(a, 'variant', 'red')
    const p = s.mergePlan(b)
    expect(p.conflicts).toHaveLength(0)
    expect(p.changes).toHaveLength(0)
  })

  it('terrain conflicts are per cell (border samples count once)', () => {
    const { s, raise, matchesHistory } = setup()
    const b = s.fork('Feature')
    raise(new Rect2i(0, 0, 2, 1), 4) // samples (0,0), (1,0)
    s.switchBranch(MAIN)
    raise(new Rect2i(1, 0, 2, 1), 1) // samples (1,0), (2,0)
    expect(s.mergePlan(b).conflicts).toHaveLength(1)
    s.mergeBranch(b, {}, merge.MINE)
    expect(terrainEdit.heightAt(s.doc, 0, 0)).toBe(4)
    expect(terrainEdit.heightAt(s.doc, 1, 0)).toBe(1)
    expect(terrainEdit.heightAt(s.doc, 2, 0)).toBe(1)
    matchesHistory()
  })

  it('a delete in the branch merges', () => {
    const { s, place } = setup()
    const a = place(Vec3.ZERO)
    const b = s.fork('Cleanup')
    s.edit('Delete', () => s.deleteObject(a))
    s.mergeBranch(b)
    expect(s.doc.hasObject(a)).toBe(false)
    expect(s.doc.occupiedChunks()).toHaveLength(0)
  })

  it('nested branch materializes', () => {
    const { s, place, set } = setup()
    const a = place(Vec3.ZERO)
    s.fork('L1')
    set(a, 'scale', 2)
    s.fork('L2')
    set(a, 'variant', 'green')
    const l2 = s.currentBranch
    s.switchBranch(MAIN)
    s.switchBranch(l2)
    expect(s.doc.getProp(a, 'scale')).toBe(2)
    expect(s.doc.getProp(a, 'variant')).toBe('green')
  })

  it("can't merge a branch with children", () => {
    const { s } = setup()
    const l1 = s.fork('L1')
    s.fork('L2')
    expect(s.mergeBranch(l1)).toBeNull()
    expect(s.branches.has(l1)).toBe(true)
  })

  it('fork at an earlier point', () => {
    const { s, place, set, matchesHistory } = setup()
    const a = place(Vec3.ZERO)
    set(a, 'variant', 'red')
    set(a, 'variant', 'blue')
    const b = s.forkAt('Back in time', MAIN, 2)
    expect(s.currentBranch).toBe(b)
    expect(s.doc.getProp(a, 'variant')).toBe('red')
    expect(s.canUndo()).toBe(false)
    set(a, 'scale', 2)
    matchesHistory()
    s.switchBranch(MAIN)
    expect(s.doc.getProp(a, 'variant')).toBe('blue')
    expect(s.doc.getProp(a, 'scale')).toBeNull()
  })

  it('history lists own entries, then inherited ones', () => {
    const { s, place, set } = setup()
    const a = place(Vec3.ZERO)
    set(a, 'variant', 'red')
    set(a, 'variant', 'blue')
    s.forkAt('Alt', MAIN, 2)
    set(a, 'scale', 3)
    const h = s.history(s.currentBranch)
    expect(h).toHaveLength(3)
    expect(h[0].txn.label).toBe('Set scale')
    expect(h[0].inherited).toBe(false)
    expect(h[1].txn.label).toBe('Set variant')
    expect(h[1].inherited).toBe(true)
    expect(h[1].seq).toBe(2)
    expect(h[2].txn.label).toBe('Place')
    expect(s.history(s.currentBranch, 2)).toHaveLength(2)
  })

  it('rename branch', () => {
    const { s } = setup()
    const b = s.fork('x')
    s.renameBranch(b, '  Better name ')
    expect(s.branches.get(b)!.name).toBe('Better name')
    s.renameBranch(b, '   ')
    expect(s.branches.get(b)!.name).toBe('Better name')
  })
})
