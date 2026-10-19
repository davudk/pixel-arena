import { describe, expect, it } from 'vitest'
import { BuildingLayout, MapDocument, ops, Rect2i, snapping, Vec2, Vec2i, Vec3, withDescendants } from '../src'

function building() {
  const doc = new MapDocument()
  doc.applyOp(ops.create('b', 'building'))
  const cell = (level: number, i: number, j: number) => doc.applyOp(ops.setProp('b', BuildingLayout.cellPath(level, new Vec2i(i, j)), true))
  const wall = (level: number, edge: string, kind: string) => doc.applyOp(ops.setProp('b', BuildingLayout.wallPath(level, edge), kind))
  const layout = () => BuildingLayout.fromObject(doc.getObject('b')!)
  return { doc, cell, wall, layout }
}

describe('BuildingLayout', () => {
  it('doorways are a wall kind, and stairs open the floor above', () => {
    const { doc, cell, wall, layout } = building()
    for (const [i, j] of [[0, 0], [1, 0]]) {
      cell(0, i, j)
      cell(1, i, j)
    }
    wall(0, '1,0,W', 'doorway')
    expect(layout().effectiveKind(0, '1,0,W')).toBe('doorway')
    doc.applyOp(ops.setProp('b', BuildingLayout.stairsPath(0, new Vec2i(0, 0)), 'E'))
    doc.applyOp(ops.setProp('b', BuildingLayout.stairsPath(0, new Vec2i(5, 5)), 'N')) // no cell there: ignored
    doc.applyOp(ops.setProp('b', BuildingLayout.stairsPath(1, new Vec2i(1, 0)), 'up')) // not a direction: ignored
    const l = layout()
    expect([...l.stairs(0).values()].map((s) => `${s.cell.key}${s.dir}`)).toEqual(['0,0E'])
    expect(l.stairs(1).size).toBe(0)
    expect([...l.floorOpenings(1)]).toEqual(['0,0'])
    expect([...l.floorOpenings(1, 2)].sort()).toEqual(['0,0', '1,0'])
  })

  it('single cell has four exterior walls', () => {
    const { cell, layout } = building()
    cell(0, 0, 0)
    const walls = layout().walls(0)
    expect(walls.size).toBe(4)
    expect(walls.get('0,0,W')!.side).toBe('W')
    expect(walls.get('1,0,W')!.side).toBe('E')
    expect(walls.get('1,0,W')!.host).toEqual(new Vec2i(0, 0))
    expect(walls.get('0,1,N')!.side).toBe('S')
  })

  it('shared edge is open by default', () => {
    const { cell, layout } = building()
    cell(0, 0, 0)
    cell(0, 1, 0)
    const walls = layout().walls(0)
    expect(walls.size).toBe(6)
    expect(walls.has('1,0,W')).toBe(false)
  })

  it('overrides change kind or open an edge', () => {
    const { cell, wall, layout } = building()
    cell(0, 0, 0)
    cell(0, 1, 0)
    wall(0, '1,0,W', 'wall')
    wall(0, '0,0,W', 'door')
    wall(0, '0,0,N', 'open')
    const l = layout()
    const walls = l.walls(0)
    expect(walls.get('1,0,W')!.kind).toBe('wall')
    expect(walls.get('1,0,W')!.host).toEqual(new Vec2i(1, 0))
    expect(walls.get('0,0,W')!.kind).toBe('door')
    expect(walls.has('0,0,N')).toBe(false)
    expect(l.effectiveKind(0, '0,0,N')).toBe('')
  })

  it('override on an edge without cells is ignored', () => {
    const { cell, wall, layout } = building()
    cell(0, 0, 0)
    wall(0, '5,5,W', 'wall')
    expect(layout().walls(0).size).toBe(4)
  })

  it('levels and roof groups', () => {
    const { cell, layout } = building()
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cell(0, i, j)
    cell(1, 0, 0)
    cell(1, 0, 1)
    const l = layout()
    expect(l.levelIndices()).toEqual([0, 1])
    const roofs = l.roofGroups()
    expect(roofs.get(1)).toEqual([new Rect2i(0, 0, 1, 2)])
    expect(roofs.get(0)).toEqual([new Rect2i(1, 0, 2, 2)])
  })

  it('decompose an L shape', () => {
    const cells = new Map([[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]].map(([x, y]) => [`${x},${y}`, new Vec2i(x, y)]))
    const rects = BuildingLayout.decompose(cells)
    expect(rects).toEqual([new Rect2i(0, 0, 3, 1), new Rect2i(0, 1, 1, 2)])
    expect(rects.reduce((a, r) => a + r.area, 0)).toBe(5)
  })

  it('roof style default and set', () => {
    const { doc, cell, layout } = building()
    cell(0, 0, 0)
    expect(layout().roofStyle).toBe('gable')
    doc.applyOp(ops.setProp('b', 'roof/style', 'hip'))
    expect(layout().roofStyle).toBe('hip')
  })
})

describe('snapping', () => {
  const { gridAxis, snapPosition, snapYaw, footprintAt } = snapping

  it('grid centers odd footprints', () => {
    expect(gridAxis(0.2, 1, 1)).toBe(0.5)
    expect(gridAxis(-0.2, 1, 1)).toBe(-0.5)
    expect(gridAxis(4.4, 3, 3)).toBe(4.5)
    expect(gridAxis(4.4, 3, 0.3)).toBe(4.5) // thin wall still occupies one cell
  })

  it('grid puts even footprints on lines', () => {
    expect(gridAxis(0.6, 1, 2)).toBe(1)
    expect(gridAxis(4.4, 3, 6)).toBe(3)
  })

  it('snap modes', () => {
    const p = new Vec3(1.26, 2, -0.74)
    expect(snapPosition(p, 'subgrid', 0.5, new Vec2(1, 1))).toEqual(new Vec3(1.5, 2, -0.5))
    expect(snapPosition(p, 'free', 0.5, new Vec2(1, 1))).toBe(p)
    expect(snapPosition(p, 'grid', 1, new Vec2(1, 2))).toEqual(new Vec3(1.5, 2, -1))
  })

  it('snap yaw', () => {
    expect(snapYaw((50 * Math.PI) / 180, 90)).toBeCloseTo(Math.PI / 2)
    expect(snapYaw((22 * Math.PI) / 180, 15)).toBeCloseTo((15 * Math.PI) / 180)
  })

  it('footprint swaps on quarter turns', () => {
    const make = (x: number, y: number) => new Vec2(x, y)
    const fp = new Vec2(3, 1)
    expect(footprintAt(fp, 0, make)).toEqual(new Vec2(3, 1))
    expect(footprintAt(fp, Math.PI / 2, make)).toEqual(new Vec2(1, 3))
    expect(footprintAt(fp, Math.PI, make)).toEqual(new Vec2(3, 1))
    expect(footprintAt(fp, -Math.PI / 2, make)).toEqual(new Vec2(1, 3))
  })

  it('withDescendants follows parent chains', () => {
    const doc = new MapDocument()
    for (const id of ['table', 'plate', 'apple', 'chair']) doc.applyOp(ops.create(id, 'prop'))
    doc.applyOp(ops.setProp('plate', 'parent', 'table'))
    doc.applyOp(ops.setProp('apple', 'parent', 'plate'))
    expect(withDescendants(doc, ['table']).sort()).toEqual(['apple', 'plate', 'table'])
    doc.applyOp(ops.del('apple'))
    expect(withDescendants(doc, ['plate'])).toHaveLength(1)
  })
})
