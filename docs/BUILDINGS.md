# Buildings: custom and premade (plan)

Status: proposal, 2026-10-18. Assets are downloaded but not yet imported. Nothing here is built yet.

## Goal

Build mode gets two catalogues:

- **Custom**: today's cell-based building tool. You draw rooms on a grid and pick wall, window
  and door pieces per edge, with kits for different styles. It grows into a real house builder:
  interior walls, stairs, furniture, more kits.
- **Premade**: dozens of ready buildings, each with outside and inside, placed in one click like
  a prop. Examples:
  - one-family houses with yards, multi-family houses, city brick row houses, town houses;
  - offices, shops;
  - hospitals, schools, police and fire stations, a city hall.

  Each premade building is *data*, a building object stored in a library file. So once placed
  it can be edited with the custom tools, or "detached" and changed freely.

Premade buildings come from a **generator**, rules that lay out floors, rooms and furniture. The
generator can make many variants per type, and we curate the best of them into the library.

## Assets (downloaded, all CC0)

| Pack | Models | Look | Use |
|---|---|---|---|
| Kenney Building Kit | 79 | Flat, untextured (light grey-lilac material) | **Core interior kit**: walls 2 m × 2.4 m, floors 2 × 2 m, doors that open, windows, stairs, columns, gutters, roof edges |
| Kenney Modular Buildings | 108 | Warm flat colors | Exterior blocks for houses, shops and apartment towers: block storeys with windows, doors, balconies, awnings; gable, slanted and flat roofs; separate door and window frames |
| Kenney City Kit Suburban | 40 | Flat, green roofs | 21 whole detached houses (type a–u), fences in 9 sizes, driveways, paths, planter, trees |
| Kenney City Kit Commercial | 41 | Flat grey and white | 14 low-rise office and shop blocks, 5 skyscrapers, awnings, parasols, and low-detail versions for distance |
| Kenney City Kit Industrial | 37 | Flat | Factories, warehouses, chimneys, tanks |
| Kenney City Kit Roads | 95 | Flat | Roads, lamps, signs, traffic lights, barriers |
| Kenney Car Kit | 50 | Flat | Cars, taxi, police, ambulance, fire truck, garbage truck, delivery trucks, tractors |
| Kenney Retro Urban | 124 | **Textured** (low-res brick, plaster, metal) | Brick and painted walls by the cube, garages, roofs, fire escapes, scaffolding, dumpsters. Best brick row-house look |
| Kenney Furniture Kit | 140 | Warm flat colors | **Core furniture**: living room, bedroom, kitchen, bathroom, home office, laundry |
| KayKit Furniture Bits | 53 | Gradient atlas, chunky | Extra living room and bedroom variety |
| KayKit Restaurant Bits | 144 | Gradient atlas | Restaurant and café kitchens, dining, food |
| KayKit City Builder Bits | 41 | Gradient atlas | Street props: hydrant, bench, bins, traffic lights, streetlight; 8 small buildings; cars |
| Quaternius House Interior | 82 | Flat, darker woods | Fireplace, chandeliers, extra beds, couches, plants, rugs, curtains |
| Styloo School Classrooms | 189 | Mixed: flat plus some glossy | Classrooms, chemistry lab, computer room, principal's office, school toilets, cafeteria, lockers, school bus |

**Licenses**: every pack includes a CC0 license file, except Quaternius and Styloo, whose CC0 is
stated on their pages. Each pack gets a `pack.json` with source and license. KayKit asks that
unmodified copies not be resold as an asset pack; shipping them inside the editor is fine, and
we credit Kay Lousberg anyway.

**Still searching** (two researchers running):
- hospital, police, fire, church, library, bank, gas station and supermarket models;
- office interiors: cubicles, whiteboards, server racks;
- yard items: mailbox, swings, pool, shed, grill;
- more modular house styles: Mediterranean, Scandinavian, Japanese, modern glass.

**Second download round** (found by the modular-kit search, not yet downloaded):
- **Quaternius Downtown City MegaKit**: free tier, 153 pieces, 223 MB, glTF. Boston/NYC row
  houses; textured.
- **Quaternius Medieval Village MegaKit**: free tier, 170 pieces, 153 MB, glTF. European
  half-timbered town houses.
- **Kenney kits**: Castle, Factory, Space Station, Modular Space.
- **KayKit Dungeon Remastered** (200 pieces, gradient atlas): medieval interiors.
- **Modular Industrial Kit** (Trey Ramm, OpenGameArt, 157 pieces): industrial lofts.

Found by the civic and yard search, also not yet downloaded:
- **Kenney Mini Market** (CC0): supermarket.
- **Kenney Train Kit** (CC0): track and trams.
- **Kenney Survival and Holiday kits** (CC0): yard props.
- **Tiny Treats Fun Playground** (CC0, 32+ models): slides, swings, see-saws.
- **Tiny Treats Homely House and Pretty Park** (CC0): fences, outdoor decor, fountain, hedges.
- **Quaternius Public Transport** (CC0, FBX, needs conversion): ambulance, school bus, train.
- **CreativeTrio Church and Mailbox** (CC0, on Poly Pizza).
- **CC-BY single models on Poly Pizza** (credit needed):
  - fire station with trucks, gas station, hospital;
  - office cubicle, server rack, water cooler, file cabinet;
  - greenhouse, trampoline.

Still uncovered: IV stand, reception desk, gym and library interiors, parking garage, mall,
museum, courthouse, pool, grill, doghouse. These get modeled in-house as simple low-poly pieces.
Building names use extruded 3D text generated in the app (an OFL / CC0 font), not letter models.

No CC0 modular kit in this style exists for Japanese, Mediterranean, Scandinavian, modern glass
or American suburban houses. Those styles come from our own kits: new colors and materials on
Kenney's pieces, plus a few modeled pieces such as dormers, bay walls and garage doors. The
closest third-party kit, MoovingBox's Low Poly House Kit, has a custom no-resale license; asking
the author for CC0 is an option.

**Gaps if nothing turns up**:
- **Civic buildings** are assembled from Kenney Modular Buildings plus a few custom props, such
  as signs with lettering, a red cross and blue lights.
- **Hospital furniture** is made from the Furniture Kit with hospital colors: beds, privacy
  curtains as thin panels, carts.
- **Small missing props** get modeled in-house as simple low-poly CC0 work.

### Scales (measured)

The packs disagree on units. Each gets a pack `scale` so everything is in meters:

| Pack | Native | Scale | Result |
|---|---|---|---|
| Building Kit | wall 2 × 2.4 | 1 | 2 m cells, 2.4 m storeys |
| Modular Buildings | block 1 × 0.625 | 4 | 4 m cells, 2.5 m storeys |
| Suburban houses | about 1.3 wide | 8 | 10 m houses |
| Commercial | about 0.9 wide | 9 | 3.9 m storeys, 26 m skyscrapers |
| Retro Urban | 1 cube | 3 | 3 m cubes (matches the current Fantasy Town kit) |
| Furniture Kit | chair 0.47 tall | 2 | 0.95 m chair, 2.25 m double bed |
| KayKit Furniture | bed 3 × 3.1 | 0.65 | 2 m bed |
| Quaternius Interior | door 4.2 tall | 0.5 | 2.1 m door |
| Styloo | door 1.47 tall | 1.4 | 2.05 m door |
| Car Kit | car 1.5 wide | 1.2 | 1.8 m car |

Pivots also differ. The Furniture Kit's origin is a back corner; the others are centered. The
importer records the bounds per model so placing and snapping use the footprint, not the
origin, as the selection rings now do.

## Building model (data)

Today a building is a grid of 3 m cells per level, with per-edge overrides (wall, window, door,
open) and a roof style. It grows to:

1. **Kit per building, with a cell size per kit**: 2 m (Building Kit interiors), 3 m (Fantasy
   Town, Retro Urban) and 4 m (Modular Buildings). Existing maps keep 3 m.
2. **Rooms**: `floors/L/rooms/<id>` lists its cells, a type (living, bedroom, kitchen, bath,
   office, classroom, ward and so on) and a floor material. Walls between two different rooms
   become interior walls; edges inside one room stay open.
3. **Interior edges**: `wall`, `door`, `doorway`, `window` (internal glass) and `open`.
4. **Stairs** as a cell kind joining level L and L+1, cutting the floor above.
5. **Furniture** as child objects of the building (already supported by parenting). They move,
   rotate and copy with the building. The cutaway hides levels above the one you're viewing.
6. **Facade details per edge or per level**: a balcony, an awning, a shop front, a sign.
7. **Roofs**: the generated roofs (gable, hip, flat) stay. Kits that have roof pieces use them,
   such as Modular Buildings' slanted and flat roof edges.
8. **Yard**: a building can own a lot rectangle. The yard gets fences, a driveway, a path,
   trees, a lawn and garden beds as child props plus painted terrain.

All of this stays in the document format. Old `.pxmap` files load unchanged, because new keys
are optional.

## Premade library

- `packs/<pack>/buildings/*.json`: each file is one building object (the same flat properties a
  map stores) plus children: furniture and yard props. It also carries a name, a category,
  themes, a footprint, storeys and a thumbnail.
- **Build mode** gets a Custom / Premade switch in the tools container:
  - **Custom** shows today's piece and kit catalogue.
  - **Premade** shows a catalogue like Props: categories, search, cards with thumbnails and
    footprint and storeys.
- **Placing** works like a prop: a ghost follows the cursor, snaps to the grid and rotates with
  R. Footprint conflicts are shown in red.
- **After placing**, it is a normal building. Selection shows its kit, roof and storeys.
  "Edit layout" switches to the custom tools on that building.
- **Whole-model buildings** (Kenney Suburban, Commercial, Industrial) also go in Premade, as
  "Simple" buildings without interiors. They're fine for background blocks.

## Generator

The generator lives in `web/core` (pure data, so it is testable and reusable by the server).
Given a **recipe** and a **seed**, it returns a building object and its children.

1. **Lot and footprint**: the recipe gives a lot size range and a footprint shape: rectangle,
   L, T or U, or a courtyard block. Row houses fill the lot width.
2. **Storeys**: a range per type, for example house 1–2, town house 3–4, apartment 4–8,
   office 3–20.
3. **Core**: the stair and elevator core is placed first for multi-storey types, then the
   corridor (spine or ring).
4. **Rooms**: split the rest of each floor with a recursive BSP into the recipe's room list, each
   with target areas and adjacency rules:
   - the kitchen next to the dining or living room;
   - the bath next to the bedrooms;
   - offices along the facade;
   - hospital wards on a corridor with a nurse station.
5. **Doors**: rooms connect to the corridor or the living room through a spanning tree, plus
   a few extra doors. The entrance goes on the street side.
6. **Windows**: on exterior walls of rooms that want light, with a rhythm per style: every edge,
   every other edge, or ribbon windows for offices. Baths get small windows.
7. **Furniture**: per room type there is a list of furnishing templates. Each template places
   furniture against walls, in corners or at the center, keeps door swings and paths clear, and
   rejects overlaps using model bounds. For example:
   - bed, two nightstands, a wardrobe and a rug;
   - a kitchen run of cabinets, sink, stove and fridge, plus a table and chairs;
   - classroom desks in rows, a blackboard and a teacher's desk.
8. **Facade**: entrance features (steps, porch, awning, sign), balconies on upper floors for
   apartments, a shop front on the ground floor for mixed use, and the roof style per recipe.
9. **Yard**, for houses: fence around the lot, gate, path to the door, driveway and garage on
   one side, trees, garden beds and lawn.
10. **Validation**:
    - every room is reachable;
    - no furniture blocks a door;
    - stairs line up between floors;
    - the footprint fits the lot.

    A failed seed is retried.

### Recipes (first set)

| Category | Variants | Notes |
|---|---|---|
| One-family house | Bungalow, two-storey, L-house, with garage | Yard, fence, driveway; 2–4 bedrooms |
| Multi-family house | Duplex, 3-storey walk-up, 6-storey apartment block | Stair core, 2–4 flats per floor, balconies |
| City brick row house | Narrow 2–3 bays, 3–4 storeys, in rows | Retro Urban brick; stoop; shop on the ground floor optional |
| Town house | European, 3–4 storeys | Narrow, steep roof, dormers |
| Office | Low-rise, mid-rise, tower | Open-plan desks, meeting rooms, reception, toilets |
| Shop and café | Corner shop, café, restaurant, supermarket | KayKit Restaurant interiors |
| School | Small, two-wing | Classrooms on a corridor, lab, computer room, principal's office, toilets, cafeteria, gym hall |
| Hospital | Clinic, small hospital | Reception, wards, nurse station, treatment rooms, ambulance bay |
| Police station | Small | Front desk, offices, holding cell, garage with police cars |
| Fire station | Small | Engine bay with fire trucks, dorm, kitchen |
| City hall, library, church | One each | Big halls, columns, stairs |

There are 4–6 generated and curated variants per row, so the first library holds about 60
premade buildings.

## Editor and rendering work

- **Pack importer**: GLB files go in `packs/<pack>/models` with a `pack.json` (scale,
  attribution). Each pack gets `props/*.json` for furniture and props, `kits/*.json` for
  modular pieces, and `buildings/*.json` for premade buildings. Validation stays the same, and
  only CC0 / CC-BY packs load.
- **Kits** map piece roles to models: `wall`, `wall_window`, `wall_door`, `doorway`, `floor`,
  `stairs`, roof parts, `balcony`, `shopfront`, `corner`. Each kit has a cell size, a storey
  height, colors, and the kit's own piece offsets and rotation conventions.
- **Interiors**:
  - the cutaway (already per level) now also hides the roof and walls of upper levels;
  - walls facing the camera on the shown level get cut to a low height, as in The Sims;
  - furniture renders instanced like props.
- **Performance**: a premade building can have hundreds of pieces. They're instanced per model,
  and distant buildings use the low-detail Kenney models or merged meshes. A test map with 50
  buildings must keep 60 fps.
- **Thumbnails**: premade buildings get a rendered isometric thumbnail, like props.

## Building kits (phase 2, done)

`packs/<pack>/kits/*.json` (written by the importer from `web/tools/packs.config.mjs`):

| Field | Meaning |
|---|---|
| `style` | `edge`: wall panels on cell edges, rooms and interiors (Building Kit, Fantasy Town). `block`: one solid piece per cell and storey, exteriors only (Modular Buildings, Retro Urban). |
| `pivot` | Edge kits: `cell` (piece origin at the cell center, panel on its +X edge; Fantasy Town) or `center` (re-centered panel, moved onto the edge). |
| `front` | Block kits: the side the piece's door and windows face. |
| `cell_size`, `wall_height`, `stairs_cells` | Grid (2, 3 or 4 m), storey height, cells a staircase runs over. |
| `pieces` | Role -> prop id or list: `wall`, `window`, `door` (e.g. a doorway wall plus a door leaf), `doorway`, `floor`, `stairs`; block kits: `block`, `wall`, `window`, `door`, `corner`. |

Kits now: Plaster walls (2 m interior kit with stairs), Town house and Apartment block (4 m
blocks), Red brick and Green panel (3 m blocks), Stone house and Timber house (3 m, Fantasy Town).
Building data gained `doorway` edges, interior walls (any edge between two cells) and
`floors/L/stairs/i,j = N|E|S|W` (the floor above the run is left open). Build mode's pieces:
Structure (Floor, Wall, Stairs) and Openings (Door, Window, Doorway); Stairs shows only for kits
that have them.

## Rooms and interiors (phase 3, done)

**Rooms**
- **Data:** `floors/L/rooms/i,j = type`. The types are `living`, `bedroom`, `kitchen`, `dining`,
  `bathroom`, `hall`, `office`, `classroom`, `shop` and `storage`. A room is the connected cells
  of one type.
- **Floors:** each type has its own floor texture from the terrain pack (`ROOM_FLOORS` in
  `world/building-visuals.ts`).
- **Painting:** Build mode's Room piece is in the Structure row, for kits with interiors. You
  drag it over cells, and the room types show as floor swatches; "No room" clears them.

**Furnishing**
- Any prop placed on a building's floor stands on it and becomes the building's child. Floor
  pieces carry `userData.floor`, and `Hit.floor` reports a floor under the cursor.
- So furniture moves, rotates, copies and deletes with the building.
- Furniture on levels above the viewed one is hidden.
- To see inside a building, use View -> Levels; Build mode's level does the same.

**Dollhouse view**
- While cut to a level, that level's interior walls and the exterior walls facing the camera
  drop to 22% of their height (`cutWalls`).
- They follow the view in 45° steps, and the selection glow follows them.
- Picking ignores hidden levels.

## Premade buildings (phase 4, done)

**The switch**
- Build mode's tool switch is Build / Erase / Premade.
- Premade uses the `premade` tool, which places a whole building like a prop (PlaceTool) and
  remembers the building last used.

**The catalogue**
- Whole-building props by category (`PREMADE_CATEGORIES`): Houses, Town houses, City blocks,
  Shops and offices, Skyscrapers, Industrial.
- Each building shows a thumbnail; the footprint is in its tooltip.
- These come from the Kenney Suburban, Commercial, Industrial and Modular Buildings samples, and
  KayKit City Builder.
- These are props, so they have no interiors. Generated premade buildings with interiors arrive
  in phases 5–7.

**Related fixes**
- Selection is shown only by marks on the ground; the yellow tint on selected objects is gone.
- A building's Kit list in Selection only offers kits on the same grid, so switching kits keeps
  its size.
- Choosing another prop while one is in hand now places the new one.

## Generator (phase 5, done)

`web/core/src/building-gen.ts` turns a recipe and a seed into a building's properties. The same
seed always gives the same building. The steps:

1. **Footprint**: a rectangle, or an L with the north-east corner cut off.
2. **Core**: the stairs and the hall around them, on the same cells on every level.
   - A house has a column from the street (south) entrance: the entry, the stairs run, then the
     landing.
   - An apartment block has a corridor along its middle row, with the stairs at its west end
     and the entrance at its east end.
3. **Zones**: the cells left over are split into zones, one per flat or house side.
4. **Rooms**: binary space partitioning splits each zone into the recipe's rooms; the largest
   part becomes the first, main room.
5. **Walls and doors**:
   - Walls go between different rooms.
   - Each zone is entered from the hall. Flats get a door; inside a house it's a doorway.
   - Inside a zone, rooms connect along a spanning tree: doors for bedrooms, bathrooms, offices
     and storage, open doorways for the rest.
6. **Windows** go on every other outside cell of rooms that want light; bathrooms get one.
7. **Validation**: every floor cell must be reachable from the entrance, or from the landing on
   upper levels. If not, it retries with the next seed.

Recipes (`building-recipes.ts`), both using the Plaster walls kit on 2 m cells:
- **House**: 5–7 × 5–6 cells, 1–2 storeys, sometimes L-shaped, gable roof.
- **Apartment**: 7–10 × 5–7 cells, 3–5 storeys, two or four flats per floor, flat roof.

Unit tests check determinism and that 30 seeds of each recipe validate, with rooms, outside door,
windows and stairs. The `generator` self-test lays out three houses and three apartment blocks
and shoots them, including a dollhouse view of each floor.

Fixed alongside:
- A new building uses the kit chosen in the catalogue.
- Block kits' corner pieces face out: the cut corner is between front and east.
- Cut-down walls stay on their own floor on upper levels.

## Editing details

- **Rectangle drag**: Floor, Erase and Room act on the rectangle of cells from where the drag
  started to the cell under the cursor, both included.
  - The change shows while dragging, and the hover box covers the rectangle.
  - Shrinking the drag puts cells back the way they were.
  - The whole drag is one undo step.
- **Upper levels**: the cells under the cursor get a wireframe down to the ground, with an
  outline at each lower floor joined at the corners. It's drawn on the overlay, so it is never
  filtered.

## Furnishing and yards (phase 6, done)

`web/core/src/building-furnish.ts`, called by the generator for every level, places furniture by
room type:
- **Bedroom**: a bed with nightstands, a dresser, a bookcase, a plant.
- **Living room**: a sofa with a coffee table, a TV on its cabinet, an armchair, shelves, a
  plant, a lamp.
- **Kitchen**: a counter run (fridge, cabinets, stove, sink), plus a table with chairs if it fits.
- **Dining room**: a table with chairs.
- **Bathroom**: a toilet, a sink, and a bathtub or shower.
- **Hall**: a coat rack.
- **Office**: a desk with a chair and screen, and a bookcase.

Rules:
- **Wall items** stand with their back to a wall or window, never a door or an opening. Long
  items span two cells along one wall.
- **Companions** (nightstands, the desk chair, the TV) go with their parent.
- **Runs** line the longest wall; **center items** stand in the room's middle.
- Nothing overlaps or leaves the room.
- The space in front of every door and doorway stays clear.
- Stairs and the floor over them are left free.
- Every model faces +z at rotation 0 (checked with the `facing` self-test).

**Houses** get a yard:
- a low fence (Kenney Suburban fence at half scale) with a gate in front of the door;
- a path to the door and a driveway through the fence;
- trees in the corners and a planter.

Furniture and yard are the building's children (`editor/generated.ts placeGenerated`), so they
move and copy with it.

## Premade library (phase 7, done)

**Recipes** (`web/core/src/building-recipes.ts`): house, row house, town house, apartment
block, shop, office, school, hospital, police station, fire station and city hall.
- Each picks its rooms per level. For example, a hospital has reception and offices below and
  wards above; a fire station has an engine bay (garage) with a fire truck.
- Each gets street-side props: benches, lamps, bushes, police cars, ambulances, a fire truck, a
  school bus.
- New room types: ward (beds), reception (desk, waiting sofa), garage (a vehicle).
- New furnishing: desk grids for classrooms and offices, and shop counters.

**Library**: `packs/premade` holds 59 buildings, baked by `web/tools/bake-premade.mjs`.
- For each recipe the bake tries many seeds, keeps one per distinct shape (size, storeys, roof,
  L), and takes an even spread from small to large.
- Buildings are stored whole: properties, furniture and yard. So the library stays the same
  when the generator changes.
- The library loads `buildings/*.json` and drops any building whose props are missing.

**Premade mode**:
- Furnished buildings come first, by category: homes, then commercial, then civic. Each shows a
  rendered thumbnail of the whole building with its yard.
- After them come the whole-building models without interiors.
- The PremadeTool shows a see-through ghost of the whole building, centered on the cursor and
  snapped to 2 m. R turns it, and a click places the building with its children as one undo
  step.

**Known gap**: every furnished building uses the Plaster walls kit, so exteriors look alike;
only the size, storeys, roof and street props differ. Kits with interiors in more styles (brick,
wood, glass) would fix it, made by recoloring the Building Kit pieces or from new packs.

## Phases

1. **Import the packs**: a scale per pack, bounds per model, thumbnails, attribution. Kenney
   Furniture, KayKit, Quaternius and Styloo props show up in Props right away, under new
   categories like Furniture, Kitchen, Bathroom, Office and School.
2. **Kits**: Building Kit (2 m), Modular Buildings (4 m) and Retro Urban (3 m) become building
   kits. Pieces gain doors, doorways, interior walls and stairs, and the cell size is per kit.
3. **Rooms and interiors** in the data model and the custom tool: draw rooms, set the room
   type, place interior doors, furnish by hand. The cutaway gets cut-down front walls.
4. **The Custom / Premade switch, with whole-model premade buildings**: the Kenney Suburban,
   Commercial and Industrial models go into the catalogue, with placing and selection.
5. **Generator core** in `web/core`, with unit tests: footprints, storeys, cores, BSP rooms,
   doors, windows and validation. The first recipes are the one-family house and the
   apartment block.
6. **Furnishing templates** per room type, plus yards.
7. **More recipes**: row houses, town houses, offices, shops, school, hospital, police, fire,
   city hall. Generate and curate about 60 buildings into `buildings/*.json`, with thumbnails.
8. **Polish and performance**: low-detail rendering at distance, the 50-building stress test,
   self-tests for placing, editing and undo.

Each phase ends usable and committed. Phases 1 and 2 alone already give many more props and
three new wall styles.

## Open questions

1. **Art direction**: mixing the warm Kenney Furniture Kit, the chunkier KayKit gradient look
   and the textured Retro Urban brick. I'd keep Kenney as the base, use KayKit for restaurant
   and furniture variety, and use Retro Urban only for brick row houses. The pixel filter
   evens out much of the difference.
2. **Interior visibility**: The Sims-style cut walls plus the per-level cutaway, or a separate
   "interior view" toggle. I'd do both: cut walls automatically when a level is selected.
3. **Premade buildings after placing**: stay linked to the library entry, so library updates
   reach maps, or become independent copies. I'd make them independent copies, which is
   simpler and predictable, with "Replace with…" to swap one for another variant.
