// Recipes for the building generator (building-gen.ts). Sizes are in cells of the kit (the
// Building Kit's 2 m cells: a house of 6 x 5 cells is 12 x 10 m; stairs run two cells).

import type { Recipe } from './building-gen'
import type { RoomType } from './building-layout'

const INTERIOR_KIT = 'kenney_building_kit:interior'

/** One-family house: one or two storeys, a hall column with the entrance on the street (south)
 *  and the stairs; the ground floor for living, the upper floor for sleeping. */
export const HOUSE: Recipe = {
  id: 'house', kit: INTERIOR_KIT, roof: 'gable', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'house', yard: true,
  width: [5, 7], depth: [5, 6], storeys: [1, 2], lShape: 0.35,
  rooms: (level, storeys, r) => {
    if (storeys === 1) return ['living', 'bedroom', 'kitchen', 'bathroom', 'bedroom']
    if (level === 0) return (r() < 0.5 ? ['living', 'kitchen', 'dining', 'bathroom'] : ['living', 'kitchen', 'bathroom']) as RoomType[]
    return ['bedroom', 'bedroom', 'bathroom', 'bedroom']
  },
}

/** Apartment block: three to five storeys around a corridor with the stairs at one end and the
 *  entrance at the other; two or four flats per floor, each with living room, bedroom, kitchen
 *  and bathroom. */
export const APARTMENT: Recipe = {
  id: 'apartment', kit: INTERIOR_KIT, roof: 'flat', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [7, 10], depth: [5, 7], storeys: [3, 5],
  rooms: ['living', 'bedroom', 'kitchen', 'bathroom'],
}

export const RECIPES: Record<string, Recipe> = { house: HOUSE, apartment: APARTMENT }
