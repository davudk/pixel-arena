import { describe, expect, it } from 'vitest'
import { APARTMENT, BuildingLayout, generateBuilding, HOUSE, MapObject, RECIPES, Vec2i, type Value } from '../src'

const layoutOf = (props: Record<string, Value>) => {
  const obj = new MapObject('b', 'building')
  for (const [k, v] of Object.entries(props)) obj.props.set(k, v)
  return BuildingLayout.fromObject(obj)
}

describe('building generator', () => {
  it('is deterministic per seed', () => {
    expect(generateBuilding(HOUSE, 7).props).toEqual(generateBuilding(HOUSE, 7).props)
    expect(generateBuilding(HOUSE, 7).props).not.toEqual(generateBuilding(HOUSE, 8).props)
  })

  for (const recipe of Object.values(RECIPES))
    it(`${recipe.id}: 30 seeds all validate, with rooms, doors, windows and stairs`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const g = generateBuilding(recipe, seed * 101)
        const l = layoutOf(g.props)
        const levels = l.levelIndices()
        expect(levels.length).toBe(g.summary.storeys)
        expect(g.summary.storeys).toBeGreaterThanOrEqual(recipe.storeys[0])
        expect(g.summary.storeys).toBeLessThanOrEqual(recipe.storeys[1])
        // Every cell has a room; the ground floor has an outside door; windows exist.
        for (const lv of levels) expect(l.rooms(lv).size).toBe(l.cells(lv).size)
        const outsideDoor = [...l.walls(0).entries()].some(([e, w]) => {
          const [a, b] = BuildingLayout.edgeCells(e)
          return w.kind === 'door' && l.cells(0).has(a.key) !== l.cells(0).has(b.key)
        })
        expect(outsideDoor).toBe(true)
        expect(g.summary.windows).toBeGreaterThan(2)
        // Stairs connect every pair of consecutive levels.
        for (const lv of levels.slice(0, -1)) expect(l.stairs(lv).size).toBe(1)
        expect(g.children.length).toBeGreaterThan(5)
        // Rooms of the recipe's kinds exist.
        const kinds = new Set(levels.flatMap((lv) => [...l.rooms(lv).values()]))
        expect(kinds.has('hall')).toBe(true)
        expect(kinds.size).toBeGreaterThanOrEqual(3)
      }
    })

  it('apartment flats are entered through doors from the corridor', () => {
    const g = generateBuilding(APARTMENT, 3)
    const l = layoutOf(g.props)
    const doors = [...l.walls(1).entries()].filter(([e, w]) => {
      if (w.kind !== 'door') return false
      const [a, b] = BuildingLayout.edgeCells(e)
      return [l.rooms(1).get(a.key), l.rooms(1).get(b.key)].includes('hall')
    })
    expect(doors.length).toBeGreaterThanOrEqual(2)
    expect(l.cells(1).has(new Vec2i(0, 0).key)).toBe(true)
  })
})

describe('furnishing', () => {
  it('rooms get their furniture, inside the building, and houses a yard', () => {
    let beds = 0, toilets = 0, sofas = 0, fridges = 0
    for (let seed = 1; seed <= 20; seed++) {
      for (const recipe of [HOUSE, APARTMENT]) {
        const g = generateBuilding(recipe, seed * 37)
        const W = g.summary.width * recipe.cellSize
        const D = g.summary.depth * recipe.cellSize
        const inside = g.children.filter((c) => c.prop.startsWith('kenney_furniture:'))
        for (const f of inside) {
          expect(f.x).toBeGreaterThan(0)
          expect(f.z).toBeGreaterThan(0)
          expect(f.x).toBeLessThan(W)
          expect(f.z).toBeLessThan(D)
        }
        beds += inside.filter((f) => f.prop.includes(':bed_')).length
        toilets += inside.filter((f) => f.prop.endsWith(':toilet')).length
        sofas += inside.filter((f) => f.prop.endsWith(':lounge_sofa')).length
        fridges += inside.filter((f) => f.prop.endsWith(':kitchen_fridge')).length
        if (recipe === HOUSE) expect(g.children.some((c) => c.prop.endsWith(':fence'))).toBe(true)
        else expect(g.children.some((c) => c.prop.endsWith(':fence'))).toBe(false)
      }
    }
    expect(beds).toBeGreaterThan(40)
    expect(toilets).toBeGreaterThan(30)
    expect(sofas).toBeGreaterThan(20)
    expect(fridges).toBeGreaterThan(20)
  })
})
