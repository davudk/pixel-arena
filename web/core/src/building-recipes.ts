// Recipes for the building generator (building-gen.ts). Sizes are in cells of the kit (the
// Building Kit's 2 m cells: a house of 6 x 5 cells is 12 x 10 m; stairs run two cells).

import type { Recipe } from './building-gen'
import type { RoomType } from './building-layout'

/** The Building Kit's wall styles (same pieces and grid, recolored walls). */
const kits = (...styles: string[]) => styles.map((s) => `kenney_building_kit:${s}`)

/** One-family house: one or two storeys, a hall column with the entrance on the street (south)
 *  and the stairs; the ground floor for living, the upper floor for sleeping. */
export const HOUSE: Recipe = {
  id: 'house', kit: kits('cream', 'timber', 'brick', 'sage', 'sky', 'interior'), roof: 'gable', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'house', yard: true,
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
  id: 'apartment', kit: kits('interior', 'brick', 'cream'), roof: 'flat', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [7, 10], depth: [5, 7], storeys: [3, 5],
  rooms: ['living', 'bedroom', 'kitchen', 'bathroom'],
}

const BENCH = 'kaykit_city:bench'
const LAMP = 'kenney_roads:light_square'
const BUSH = 'kaykit_city:bush'

/** City row house: narrow and deep, two or three storeys, living below and bedrooms above. */
export const ROW_HOUSE: Recipe = {
  id: 'row', kit: kits('brick', 'cream'), roof: 'gable', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'house',
  width: [3, 4], depth: [6, 7], storeys: [2, 3], front: [BUSH],
  rooms: (level) => (level === 0 ? ['living', 'kitchen', 'bathroom'] : ['bedroom', 'bedroom', 'bathroom']),
}

/** Town house: three storeys, a little wider, a steep gable. */
export const TOWN_HOUSE: Recipe = {
  id: 'town', kit: kits('cream', 'sage', 'brick'), roof: ['gable', 'hip'], stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'house',
  width: [4, 5], depth: [5, 6], storeys: [3, 3], front: [BUSH, BENCH],
  rooms: (level) => (level === 0 ? ['living', 'kitchen', 'dining', 'bathroom'] : level === 1 ? ['bedroom', 'bedroom', 'bathroom'] : ['bedroom', 'office', 'bathroom']),
}

/** Office block: a corridor with offices of desks on both sides, three to six storeys. */
export const OFFICE: Recipe = {
  id: 'office', kit: kits('interior', 'sky'), roof: 'flat', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [8, 11], depth: [5, 7], storeys: [3, 6], front: [BENCH, LAMP, BENCH],
  rooms: (level) => (level === 0 ? ['reception', 'office', 'bathroom'] : ['office', 'office', 'bathroom']),
}

/** Corner shop: a shop and stockroom below, a flat above. */
export const SHOP: Recipe = {
  id: 'shop', kit: kits('brick', 'timber', 'sky'), roof: ['gable', 'flat'], stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'house',
  width: [4, 6], depth: [4, 6], storeys: [1, 2], front: ['kaykit_city:trash_a', BENCH],
  rooms: (level) => (level === 0 ? ['shop', 'storage', 'bathroom'] : ['living', 'bedroom', 'kitchen', 'bathroom']),
}

/** School: classrooms along a corridor, one or two storeys, a school bus in front. */
export const SCHOOL: Recipe = {
  id: 'school', kit: kits('brick', 'cream'), roof: ['hip', 'flat'], stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [10, 13], depth: [7, 9], storeys: [1, 2], front: ['styloo_school:classroom_schoolbus', BENCH],
  rooms: (level) => (level === 0 ? ['classroom', 'office', 'bathroom'] : ['classroom', 'classroom', 'bathroom']),
}

/** Hospital: reception and offices below, wards above, ambulances in front. */
export const HOSPITAL: Recipe = {
  id: 'hospital', kit: kits('white'), roof: 'flat', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [10, 13], depth: [7, 9], storeys: [2, 4], front: ['kenney_cars:ambulance', 'kenney_cars:ambulance', LAMP],
  rooms: (level) => (level === 0 ? ['reception', 'office', 'bathroom'] : ['ward', 'ward', 'bathroom']),
}

/** Police station: a front desk and offices, police cars outside. */
export const POLICE: Recipe = {
  id: 'police', kit: kits('sky'), roof: ['flat', 'hip'], stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [8, 10], depth: [5, 7], storeys: [2, 2], front: ['kenney_cars:police', 'kenney_cars:police', LAMP],
  rooms: (level) => (level === 0 ? ['reception', 'office', 'storage'] : ['office', 'office', 'bathroom']),
}

/** Fire station: an engine bay with a fire truck, the crew's rooms above. */
export const FIRE_STATION: Recipe = {
  id: 'fire', kit: kits('brick'), roof: ['flat', 'gable'], stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [8, 10], depth: [5, 7], storeys: [2, 2], front: ['kenney_cars:firetruck', 'kaykit_city:firehydrant'],
  rooms: (level) => (level === 0 ? ['garage', 'reception', 'bathroom'] : ['bedroom', 'kitchen', 'bathroom']),
}

/** City hall: wide, two or three storeys of reception and offices, benches and lamps in front. */
export const CITY_HALL: Recipe = {
  id: 'cityhall', kit: kits('cream'), roof: 'hip', stairsCells: 2, cellSize: 2, wallHeight: 2.4, floorY: 0.1, layout: 'corridor',
  width: [11, 14], depth: [7, 9], storeys: [2, 3], front: [LAMP, BENCH, BUSH, BENCH, LAMP],
  rooms: (level) => (level === 0 ? ['reception', 'office', 'office', 'bathroom'] : ['office', 'office', 'dining', 'bathroom']),
}

export const RECIPES: Record<string, Recipe> = {
  house: HOUSE, apartment: APARTMENT, row: ROW_HOUSE, town: TOWN_HOUSE, office: OFFICE, shop: SHOP,
  school: SCHOOL, hospital: HOSPITAL, police: POLICE, fire: FIRE_STATION, cityhall: CITY_HALL,
}
