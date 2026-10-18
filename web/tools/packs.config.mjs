// Third-party packs imported by import-packs.mjs: where each came from, its license, the scale
// that makes its models meters, which files to take, and how to categorize and place them.
// Categories follow the existing packs' "group/subgroup" style. Scales were measured
// (docs/BUILDINGS.md): doors about 2.1 m, storeys 2.4-3 m, chairs 0.9 m, cars 1.8 m wide.

const KENNEY = { author: 'Kenney', license: 'CC0-1.0', licenseFile: 'License.txt', textureDirs: ['Models/GLB format/Textures'] }
const KAYKIT = { author: 'Kay Lousberg (KayKit)', license: 'CC0-1.0' }

/** Placement by kind: furniture snaps to 25 cm, street props to 50 cm, vehicles and whole
 *  buildings to 1 m, modular pieces to their grid. */
const place = (mode, step, rotate = 15) => () => ({ mode, step, align: 'ground', rotate_snap_deg: rotate })
const FURNITURE = place('subgrid', 0.25, 15)
const STREET = place('subgrid', 0.5, 15)
const VEHICLE = place('subgrid', 0.5, 15)
const BUILDING = place('subgrid', 1, 90)

/** Rooms by keyword, shared by the furniture packs (first match wins). */
const ROOMS = [
  [/bath|toilet|shower|towel|bathroom|mirror/i, 'bathroom'],
  [/kitchen|fridge|stove|oven|microwave|hood|toaster|blender|coffee|dish|counter|cupboard|pan\b|pot\b/i, 'kitchen'],
  [/bed|nightstand|night stand|wardrobe|dresser|drawer|closet/i, 'bedroom'],
  [/desk|computer|laptop|keyboard|mouse|screen|monitor|printer|office|filing/i, 'office'],
  [/chair|table|stool|bench/i, 'dining'],
  [/sofa|couch|armchair|lounge|television|\btv\b|radio|speaker|rug|carpet|pillow|fireplace|book|shelf|plant|cactus|lamp|light|chandelier|fan|curtain|painting|picture|frame|clock|vase/i, 'living'],
]
const room = (name) => ROOMS.find(([re]) => re.test(name))?.[1] ?? 'misc'

export const PACKS = [
  {
    ...KENNEY, id: 'kenney_furniture', title: 'Furniture Kit', version: '1.0', url: 'https://kenney.nl/assets/furniture-kit',
    source: 'x-furniture-kit', textureDirs: [], models: /^Models\/GLTF format\//, scale: 2,
    exclude: /^(wall|floor|doorway|paneling|stairs)/i,
    category: (n) => `furniture/${n === 'bear' ? 'living' : /^(washer|dryer|trashcan|coatRack|cardboard)/.test(n) ? 'misc' : room(n)}`,
    themes: () => ['interior', 'home', 'modern'],
    placement: FURNITURE,
  },
  {
    ...KAYKIT, id: 'kaykit_furniture', title: 'Furniture Bits', version: '1.0', url: 'https://kaylousberg.itch.io/furniture-bits',
    source: 'x-kaykit-furniture', licenseFile: 'KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/LICENSE.txt',
    models: /Assets\/gltf\//, scale: 0.65,
    category: (n) => `furniture/${room(n)}`,
    themes: () => ['interior', 'home', 'cozy'],
    placement: FURNITURE,
  },
  {
    ...KAYKIT, id: 'kaykit_restaurant', title: 'Restaurant Bits', version: '1.0', url: 'https://kaylousberg.itch.io/restaurant-bits',
    source: 'x-kaykit-restaurant', licenseFile: 'KayKit-Restaurant-Bits-1.0-main/addons/kaykit_restaurant_bits/Assets/LICENSE.txt',
    models: /Assets\/gltf\//, scale: 0.75,
    category: (n) => (/^(wall|floor)/i.test(n) ? 'restaurant/building' : /chair|table|stool|bench|booth/i.test(n) ? 'restaurant/dining'
      : /stove|oven|fridge|freezer|sink|counter|cabinet|shelf|crate|fryer|grill|hood|kitchen|cuttingboard|dispenser|mixer/i.test(n) ? 'restaurant/kitchen' : 'restaurant/food'),
    themes: () => ['interior', 'restaurant', 'shop'],
    placement: FURNITURE,
  },
  {
    ...KAYKIT, id: 'kaykit_city', title: 'City Builder Bits', version: '1.0', url: 'https://kaylousberg.itch.io/city-builder-bits',
    source: 'x-kaykit-city-builder', licenseFile: 'KayKit-City-Builder-Bits-1.0-main/addons/kaykit_city_builder_bits/Assets/LICENSE.txt',
    models: /Assets\/gltf\//, scale: 4,
    exclude: /_withoutBase$/i,
    category: (n) => (/^building/.test(n) ? 'city/buildings' : /^car/.test(n) ? 'vehicles/cars' : /^road|^base/.test(n) ? 'terrain/roads' : 'city/street'),
    themes: () => ['city', 'modern', 'town'],
    placement: (c) => (c === 'city/buildings' ? BUILDING() : c === 'terrain/roads' ? place('grid', 8, 90)() : c.startsWith('vehicles') ? VEHICLE() : STREET()),
  },
  {
    id: 'quaternius_interior', title: 'Ultimate House Interior Pack', version: '1.0', author: 'Quaternius',
    url: 'https://quaternius.com/packs/ultimatehomeinterior.html', license: 'CC0-1.0',
    source: 'x-quaternius-interior', models: /\.glb$/i, scale: 0.5,
    slug: (n) => n.replace(/-[A-Za-z0-9]{6,}$/, ''),
    name_of: (n) => n.replace(/-[A-Za-z0-9]{6,}$/, '').replace(/\b\w/g, (c) => c.toUpperCase()),
    category: (n) => (/^(door|window)/i.test(n) ? 'furniture/doors-windows' : `furniture/${room(n)}`),
    themes: () => ['interior', 'home', 'modern'],
    placement: FURNITURE,
  },
  {
    id: 'styloo_school', title: 'School Classrooms Asset Pack', version: '1.0', author: 'styloo',
    url: 'https://styloo.itch.io/classroom-asset-pack', license: 'CC0-1.0',
    source: 'x-styloo-classroom', models: /^[^/]+\/(?!walls\/)[^/]+\/[^/]+\/[^/]+\.glb$/i, scale: 1.4,
    // Room shells and tiny desk clutter (pens, chalk, sticky notes...) stay out.
    exclude: /demoscene|^(pencil|pen|pen4colors|chalk|markers|postit|COMPUTERusb|toiletsoap|toiletpoop|CHESMISTRYatoms|brush|scissors|compass|watch|wallsfloor|toiletwallsfloor|PRINCIPALOFFICEwalls|CAFETERIAwallfloor|holder)(_\d+)?_?$/i,
    slug: (n, rel) => `${rel.split('/')[1].replace(/\s+/g, '-')}-${n.replace(/^(CAFETERIA|CHEMISTRY|CHESMISTRY|COMPUTER|PRINCIPALOFFICE|toilet)/i, '')}`,
    name_of: (n) => {
      const bare = n.replace(/^(CAFETERIA|CHEMISTRY|CHESMISTRY|COMPUTER|PRINCIPALOFFICE)/i, '').replace(/_+(\d+)$/, (_, d) => ` ${Number(d) + 1}`)
      return bare.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase())
    },
    category: (_, rel) => `school/${({ ArtRoom: 'art', catferia: 'cafeteria', 'chemestry lab': 'lab', classroom: 'classroom', computer: 'computers', 'principal office': 'office', toilet: 'toilets' })[rel.split('/')[1]] ?? 'misc'}`,
    themes: () => ['interior', 'school', 'modern'],
    placement: FURNITURE,
  },
  {
    ...KENNEY, id: 'kenney_cars', title: 'Car Kit', version: '3.0', url: 'https://kenney.nl/assets/car-kit',
    source: 'x-car-kit', models: /^Models\/GLB format\//, scale: 1.2,
    exclude: /^wheel|^debris/i,
    category: (n) => (/cone|box|barrier/i.test(n) ? 'city/street' : /tractor/i.test(n) ? 'vehicles/farm' : /kart|race/i.test(n) ? 'vehicles/racing'
      : /police|ambulance|firetruck|fire-truck|garbage/i.test(n) ? 'vehicles/service' : /truck|van|delivery/i.test(n) ? 'vehicles/trucks' : 'vehicles/cars'),
    themes: (c) => (c.includes('farm') ? ['farm', 'countryside'] : ['city', 'modern']),
    placement: VEHICLE,
  },
  {
    ...KENNEY, id: 'kenney_suburban', title: 'City Kit (Suburban)', version: '2.0', url: 'https://kenney.nl/assets/city-kit-suburban',
    source: 'x-city-suburban', models: /^Models\/GLB format\//, scale: 8,
    category: (n) => (/^building/.test(n) ? 'buildings/houses' : /^fence/.test(n) ? 'structures/fences' : /^(driveway|path)/.test(n) ? 'terrain/paths' : /^tree/.test(n) ? 'nature/trees' : 'city/yard'),
    name_of: (n) => n.replace(/^building-type-(\w)$/, (_, l) => `Suburban House ${l.toUpperCase()}`).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    themes: () => ['suburban', 'modern', 'town'],
    placement: (c) => (c === 'buildings/houses' ? BUILDING() : c === 'structures/fences' ? place('subgrid', 0.5, 90)() : STREET()),
  },
  {
    ...KENNEY, id: 'kenney_commercial', title: 'City Kit (Commercial)', version: '2.1', url: 'https://kenney.nl/assets/city-kit-commercial',
    source: 'x-city-commercial', models: /^Models\/GLB format\//, scale: 9,
    exclude: /^low-detail/,
    category: (n) => (/skyscraper/.test(n) ? 'buildings/skyscrapers' : /^building/.test(n) ? 'buildings/commercial' : 'city/street'),
    name_of: (n) => n.replace(/^building-skyscraper-(\w)$/, (_, l) => `Skyscraper ${l.toUpperCase()}`).replace(/^building-(\w)$/, (_, l) => `Commercial Building ${l.toUpperCase()}`).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    themes: () => ['city', 'modern'],
    placement: (c) => (c.startsWith('buildings') ? BUILDING() : STREET()),
  },
  {
    ...KENNEY, id: 'kenney_industrial', title: 'City Kit (Industrial)', version: '2.0', url: 'https://kenney.nl/assets/city-kit-industrial',
    source: 'x-city-industrial', models: /^Models\/GLB format\//, scale: 10,
    category: (n) => (/^building/.test(n) ? 'buildings/industrial' : 'city/industrial'),
    name_of: (n) => n.replace(/^building-(\w)$/, (_, l) => `Industrial Building ${l.toUpperCase()}`).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    themes: () => ['city', 'industrial'],
    placement: (c) => (c.startsWith('buildings') ? BUILDING() : STREET()),
  },
  {
    ...KENNEY, id: 'kenney_roads', title: 'City Kit (Roads)', version: '2.2', url: 'https://kenney.nl/assets/city-kit-roads',
    source: 'x-city-roads', models: /^Models\/GLB format\//, scale: 8,
    category: (n) => (/^(road|tile|bridge)/.test(n) ? 'terrain/roads' : 'city/street'),
    themes: () => ['city', 'modern'],
    placement: (c) => (c === 'terrain/roads' ? place('grid', 8, 90)() : STREET()),
  },
  {
    ...KENNEY, id: 'kenney_retro_urban', title: 'Retro Urban Kit', version: '2.0', url: 'https://kenney.nl/assets/retro-urban-kit',
    source: 'x-retro-urban', models: /^Models\/GLB format\//, scale: 3,
    category: (n) => (/^(wall|window|door|balcony|roof)/.test(n) ? 'buildings/brick' : /^(road|grass|cliff)/.test(n) ? 'terrain/urban' : /^truck/.test(n) ? 'vehicles/trucks' : /^tree/.test(n) ? 'nature/trees' : 'city/street'),
    themes: () => ['city', 'retro', 'industrial'],
    placement: (c) => (c === 'buildings/brick' || c === 'terrain/urban' ? place('grid', 3, 90)() : c.startsWith('vehicles') ? VEHICLE() : STREET()),
  },
  {
    ...KENNEY, id: 'kenney_modular_buildings', title: 'Modular Buildings', version: '1.0', url: 'https://kenney.nl/assets/modular-buildings',
    source: 'x-modular-buildings', models: /^Models\/GLB format\//, scale: 4,
    category: (n) => (/^building-sample/.test(n) ? 'buildings/samples' : /^roof/.test(n) ? 'buildings/modular-roofs' : /^(door|window)/.test(n) ? 'buildings/modular-details' : /^detail/.test(n) ? 'buildings/modular-details' : 'buildings/modular'),
    themes: () => ['city', 'modern', 'town'],
    placement: (c) => (c === 'buildings/modular-details' ? place('subgrid', 0.25, 90)() : place('grid', 4, 90)()),
  },
  {
    ...KENNEY, id: 'kenney_building_kit', title: 'Building Kit', version: '1.0', url: 'https://kenney.nl/assets/building-kit',
    source: 'x-building-kit', models: /^Models\/GLB format\//, scale: 1,
    category: (n) => (/^(door|barricade)/.test(n) ? 'buildings/interior-doors' : /^(stairs)/.test(n) ? 'buildings/interior-stairs' : /^(floor|roof|border)/.test(n) ? 'buildings/interior-floors' : 'buildings/interior-walls'),
    themes: () => ['interior', 'modern'],
    placement: (c) => (c === 'buildings/interior-doors' ? place('subgrid', 0.25, 90)() : place('grid', 2, 90)()),
  },
]
