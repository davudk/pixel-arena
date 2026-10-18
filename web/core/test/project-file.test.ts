import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BuildingLayout, codec, MAIN, MapDocument, MapSession, openProject, PackedVec2Array, ProjectError, Rect2i,
  saveProject, SETTINGS_ID, terrainEdit, Vec2, Vec2i, Vec3,
} from '../src'
import { diff } from '../src/merge'

function place(s: MapSession, pos: Vec3) {
  let id = ''
  s.edit('Place', () => (id = s.createObject('prop', { prop: 'core:tree', position: pos, rotation: 0.5 })))
  return id
}

describe('codec (Godot JSON.from_native format)', () => {
  it('encodes scalars and Godot types like Godot does', () => {
    expect(codec.encode('hi')).toBe('s:hi')
    expect(codec.encode(0.5)).toBe('f:0.5')
    expect(codec.encode(2)).toBe('f:2.0')
    expect(codec.encode(codec.int(2))).toBe('i:2')
    expect(codec.encode(null)).toBeNull()
    expect(codec.encode(true)).toBe(true)
    expect(codec.encode(new Vec3(1, 2, 3))).toEqual({ type: 'Vector3', args: [1, 2, 3] })
    expect(codec.encode(new Rect2i(1, 2, 3, 4))).toEqual({ type: 'Rect2i', args: [1, 2, 3, 4] })
    expect(codec.encode({ a: 1 })).toEqual({ type: 'Dictionary', args: ['s:a', 'f:1.0'] })
  })

  it('decodes everything it encodes', () => {
    const v = {
      s: 'x', n: 1.25, b: false, z: null, v3: new Vec3(1, -2, 3.5), v2: new Vec2(0.5, 1), v2i: new Vec2i(-3, 4),
      r: new Rect2i(0, 1, 2, 3), f: new Float32Array([0.5, 1]), u: new Uint8Array([1, 255]),
      poly: new PackedVec2Array([new Vec2(1, 2), new Vec2(3, 4)]), list: [1, 'a', [new Vec3(0, 0, 0)]],
    }
    expect(codec.parse(codec.stringify(v))).toEqual(v)
  })

  it('reads StringName keys, typed arrays and ints', () => {
    expect(codec.decode({ type: 'Dictionary', args: ['sn:prev', null, 's:k', 'i:7'] })).toEqual({ prev: null, k: 7 })
    expect(codec.decode({ type: 'Array', elem_type: 'Dictionary', args: [{ type: 'Dictionary', args: [] }] })).toEqual([{}])
  })
})

describe('.pxmap files', () => {
  it('round trip preserves state and history', () => {
    const s = new MapSession()
    const a = place(s, new Vec3(1.5, 0, -2))
    s.edit('Raise', () => terrainEdit.heightOps(s.doc, new Rect2i(30, 30, 4, 4), () => 2.5).forEach((op) => s.apply(op)))
    const b = s.fork('Branch')
    s.edit('Paint', () => s.setProp(a, 'variant', 'red'))

    const loaded = openProject(saveProject(s))
    expect(loaded.doc.mapId).toBe(s.doc.mapId)
    expect(loaded.currentBranch).toBe(b)
    expect(diff(s.doc, loaded.doc).size).toBe(0)
    expect(loaded.branches.size).toBe(2)
    expect(loaded.lamport).toBe(s.lamport)

    loaded.undo()
    expect(loaded.doc.getProp(a, 'variant')).toBeNull()
    loaded.switchBranch(MAIN)
    expect(terrainEdit.heightAt(loaded.doc, 32, 32)).toBe(2.5)
  })

  it('without a matching snapshot, history is replayed', () => {
    const s = new MapSession()
    const a = place(s, new Vec3(3, 0, 3))
    const fresh = new MapSession(s.doc.mapId)
    fresh.loadHistory(codec.parse(codec.stringify(s.historyToDict())) as never)
    fresh.rebuildDocument()
    expect(diff(s.doc, fresh.doc).size).toBe(0)
    expect(fresh.doc.hasObject(a)).toBe(true)
  })

  it('rejects bytes that are not a project', () => {
    expect(() => openProject(new Uint8Array([1, 2, 3]))).toThrow(ProjectError)
  })
})

describe('compatibility with the Godot build', () => {
  // Saved by the Godot app (web/core/test/fixtures/godot-sample.pxmap): two props (one parented),
  // terrain heights across a chunk border, painted materials, water, a building, a settings
  // change, an undone move, and a branch "Autumn" (current) with one edit.
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/godot-sample.pxmap', import.meta.url)))

  it('opens a Godot-saved project', () => {
    const s = openProject(bytes, 'alice')
    expect(s.doc.mapId).toBe('11111111-2222-4333-8444-555555555555')
    expect(s.branches.get(MAIN)!.txns).toHaveLength(7)
    expect(s.branch().name).toBe('Autumn')
    expect(s.branch().txns).toHaveLength(1)
    expect(s.doc.getSetting('view/time_of_day')).toBe(17.5)

    const props = [...s.doc.objects.values()].filter((o) => o.type === 'prop')
    const tree = props.find((o) => o.props.get('prop') === 'kenney_nature:tree_oak')!
    expect(tree.props.get('position')).toEqual(new Vec3(1.5, 0.25, -2.5)) // the move was undone
    expect(tree.props.get('variant')).toBe('autumn')
    const pot = props.find((o) => o.props.get('prop') === 'kenney_nature:pot_small')!
    expect(pot.props.get('parent')).toBe(tree.id)

    const water = [...s.doc.objects.values()].find((o) => o.type === 'water')!
    expect((water.props.get('polygon') as PackedVec2Array).points).toHaveLength(3)
    const building = [...s.doc.objects.values()].find((o) => o.type === 'building')!
    const layout = BuildingLayout.fromObject(building)
    expect(layout.roofStyle).toBe('hip')
    expect(layout.walls(0).get('1,1,N')!.kind).toBe('door')

    expect(terrainEdit.heightAt(s.doc, 32, 31)).toBe(1.5)
    expect(terrainEdit.materialAt(s.doc, -1, -1)).toBe(2)
    expect(s.doc.objects.get(SETTINGS_ID)).toBeDefined()
  })

  it('replaying the Godot history reproduces the Godot snapshot exactly', () => {
    const s = openProject(bytes, 'alice')
    expect(diff(s.doc, s.materialize(s.currentBranch)).size).toBe(0)
  })

  it('undo/redo and merge work on the Godot history', () => {
    const s = openProject(bytes, 'alice')
    const tree = [...s.doc.objects.values()].find((o) => o.props.get('prop') === 'kenney_nature:tree_oak')!
    s.undo()
    expect(s.doc.getProp(tree.id, 'variant')).toBeNull()
    s.redo()
    expect(s.doc.getProp(tree.id, 'variant')).toBe('autumn')
    s.switchBranch(MAIN)
    s.redo() // the Godot session had undone "Move tree" on main
    expect(s.doc.getProp(tree.id, 'position')).toEqual(new Vec3(4, 0, 4))
    const autumn = [...s.branches.values()].find((b) => b.name === 'Autumn')!
    s.mergeBranch(autumn.id)
    expect(s.doc.getProp(tree.id, 'variant')).toBe('autumn')
    expect(diff(s.doc, s.materialize(s.currentBranch)).size).toBe(0)
  })

  it('re-saving a Godot project round-trips', () => {
    const s = openProject(bytes, 'alice')
    const again = openProject(saveProject(s), 'alice')
    expect(diff(s.doc, again.doc).size).toBe(0)
    expect(again.branches.size).toBe(s.branches.size)
    expect(diff(again.doc, again.materialize(again.currentBranch)).size).toBe(0)
  })

  it('MapDocument.fromDict handles terrain chunk keys', () => {
    const s = openProject(bytes)
    const doc = MapDocument.fromDict(codec.parse(codec.stringify(s.doc.toDict())) as never)
    expect([...doc.terrain.keys()].sort()).toEqual([...s.doc.terrain.keys()].sort())
  })
})
