# Pixel Arena — Plan

Working title: **pixel-arena**. A desktop map editor (Steam, Windows + macOS) for building
3D maps rendered with swappable stylized filters (pixel art by default). Users place props from a
large, searchable library, sculpt terrain, and construct modular buildings.

Engine: **Godot 4.7 (standard / GDScript)** — `/Applications/Godot.app`.

> **Platform decision (2026-10-18):** the app is being ported from Godot to a web stack
> (TypeScript + three.js, Svelte UI, Electron for desktop) so the editor gets an HTML/CSS UI and
> shared maps open natively in a browser. Evidence: `web-spike/REPORT.md` (on the `web-spike`
> branch). The Godot code stays as the reference implementation until the port reaches parity;
> M7 (filters & export) will be built in the web version. Port progress is tracked under
> "Status" below.

---

## 1. Scope

### v1 (local, single player)
- Unbounded, sparse, chunked map that grows seamlessly in every direction.
- Heightmap terrain: sculpt (hills, cliffs), paint materials, water bodies.
- Prop library from manifests: browse by category, filter by theme, text search.
- Free-position props with editor snapping (grid / sub-grid / free / surface).
- Animated props (fire, flags, water).
- Modular buildings: foundations, walls, doors/windows, floors (stories), roofs, cutaway view.
- Command-based editing: transactions, undo/redo, branching (fork / discard / merge).
- Configurable, zoomable camera.
- Post-process filter stack (pixel, oil paint, gothic, …) with options.
- Time of day: fixed time or day/night cycle with configurable length.
- Export: screenshot of current view, full-map top-down render, renders from preset angles.
- Save / load / autosave.
- Credits screen generated from asset attribution.

### Later (designed for now, built later)
- Underground layers (caves, dungeons) — reuses the building floor/cutaway system.
- Co-op: self-hosted, invite-only server; simultaneous editing.
- Shareable links; viewing in browser and in-game.
- Per-player view settings (filters, time of day) with server defaults.
- Video export (orbit, A→B flight, recorded path) and build timelapse (via ffmpeg).
- Custom content / Steam Workshop (prop packs, maps).

---

## 2. Core principles

1. **The map is data.** A pure-data document is the source of truth; Godot nodes are a
   disposable view generated from it. The data layer has no dependency on the scene tree so it
   can be reused by a headless server and a web viewer.
2. **Every edit is a transaction of primitive ops.** Undo/redo, autosave, branching, timelapse
   and future network sync all ride on the same op log.
3. **Every object has a stable UUID**, generated at creation and never reused.
4. **The prop library is data-driven** via namespaced manifests with attribution.
5. **Snapping is editor behavior, not data.** All positions are stored as floats.
6. **View settings are not map data.** Filters, time of day and camera are layered settings
   (app default → map default → server default → player override).

---

## 3. World & coordinates

- Godot Y-up; ground plane is XZ. **1 unit = 1 meter. Grid cell = 1 m.**
- **Chunks:** 32 × 32 m. A chunk exists only if it contains something (objects or edited
  terrain). Stored in a `Dictionary[Vector2i → Chunk]`. Empty space costs nothing.
- Untouched terrain is implicit: flat, height 0, default material.
- Chunk membership of objects is a *derived spatial index* (rebuilt on load), not stored
  per object. Objects store absolute positions.
- Far-from-origin float precision: fine for tens of km; a floating origin can be added later if
  needed.

---

## 4. Data model

### Document
```
Document
  format_version
  map_id (uuid)
  settings          # map defaults: filter preset, time of day, day length, grid prefs
  objects           # Dictionary[uuid → MapObject]
  terrain           # Dictionary[Vector2i → TerrainChunk]  (sparse)
  packs_used        # pack ids + versions referenced (for missing-content warnings)
```

### MapObject
Every object is a flat bag of properties addressed by **path**:
```
id            uuid
type          "prop" | "building" | "water" | ...
prop          "pack_id:prop_id"            (for props)
position      Vector3
rotation      float (yaw, radians)  # v1; full rotation possible later
scale         float
parent        uuid | null          # e.g. mug sits on table; moves with it
variant       string               # color/texture variant from manifest
anim_offset   float                # desync identical animations
deleted       bool                 # tombstone (enables undo-of-delete and sync)
```

### TerrainChunk
- Height grid: 33 × 33 samples at 1 m spacing (edges shared with neighbors).
- Material weights per cell (splat map, up to N materials per chunk from a terrain palette).
- Stored only when edited.

### Water bodies
- Objects of type `water`: a polygon region + surface height. Rendered as a plane clipped by
  terrain. (Rivers/flow later.)

### Buildings
A building is **one object** with a structured interior, all addressable by path:
```
Building
  kit           "pack_id:kit_id"       # defines cell size, wall height, pieces per role
  origin, rotation (90° steps)
  floors[level]
    cells                 # set of Vector2i — foundation / floor footprint
    floor_tiles[cell]     # tile prop per cell (indoor tiles)
    walls[edge]           # wall piece per cell edge; edge key = "x,y,N" | "x,y,W"
    openings[edge]        # door/window piece replacing a wall segment
  roof          style (flat | gable | hip) + material
```
- Painting foundation cells auto-places walls on exterior edges (toggleable); removing cells
  removes orphaned walls.
- Interior walls drawn with an edge tool; doors/windows replace wall segments.
- Adding a floor copies the footprint upward (editable).
- Roof generated from the top footprint (v1: flat for any shape, gable/hip for rectangles).
- Building base sits at max terrain height of its footprint with a foundation skirt;
  optional "flatten terrain under building".
- **Cutaway:** editing level N hides levels above N and the roof.

---

## 5. Operations, transactions, history

### Primitive ops
```
create(id, type, props)
delete(id)                           # sets tombstone
set(id, path, value)                 # path e.g. "position", "floors/0/walls/3,4,N"
terrain_patch(chunk, rect, values)   # heights or material weights, per-cell
```
Each op records the **previous value** it overwrote (for undo and conflict checks).

### Transactions
- A user action (e.g. "add wall segment", "sculpt stroke") produces one transaction containing
  many primitive ops. **The transaction is the unit of undo.**
- Metadata: `txn_id, author_id, label, timestamp, branch_id, seq`.
- High-level editor commands live in the editor layer and compile down to transactions; the
  core only knows primitive ops.

### Undo / redo (designed for multiple players)
**Per-user selective undo.** Undo never rewinds shared history; it appends a new transaction
that inverts *your own* last transaction:
- For each `set`: if the path's current value is still what you wrote, restore the previous
  value; if someone else changed it since, skip it (notify).
- `create` → `delete`; `delete` → restore (clear tombstone).
- `terrain_patch` → per cell, same rule as `set`.
- Redo re-applies symmetrically. In single player this behaves like classic undo.

### Concurrency (future co-op)
- Server-ordered op log with **last-writer-wins per property path** (Figma-style), not a full
  CRDT. Different objects/paths never conflict; same path → last wins.
- Ops carry `author_id` + Lamport clock now, so the format doesn't change when the server
  arrives (it just assigns authoritative `seq`).

### Branching
- The log is a set of **branches**. A branch = `{id, name, parent_branch, fork_seq, txns[]}`.
- **Fork:** create a branch at the current point; edits go to it.
- **Discard:** delete the branch.
- **Merge (keep):** replay the branch's transactions onto the target head. Paths changed on
  both sides since the fork are **conflicts**, shown to the user (keep mine / keep theirs,
  per item or in bulk). Everything else merges automatically.
- **Snapshots:** materialized document state every N transactions and at branch points, so
  loading doesn't replay the full log. Named snapshots act as versions.
- Bonus: replaying the log gives the **build timelapse** for free.

---

## 6. Persistence

- One project file `*.pxmap` = zip (Godot `ZIPPacker`/`ZIPReader`) containing:
  - `meta.json` (format version, map id; later packs used, thumbnail)
  - `history.json` (all branches, their transactions, undo/redo stacks)
  - `snapshot.json` (document at the current branch head; JSON now, binary later if needed)
- Saves write a temp file and rename it over the target.
- **Autosave / crash safety:** transactions are appended to a journal file as they happen;
  periodic compaction into the zip.
- Versioned format with migrations from day one.

---

## 7. Prop library & manifests

### Packs
```
packs/<pack_id>/
  pack.json         # id, name, version, author, default license/attribution
  props/*.json      # one or many prop definitions
  kits/*.json       # building kits
  terrain/*.json    # terrain materials
  assets/           # .glb, textures
```
- Full ids are namespaced: `pack_id:prop_id`. Built-in pack is `core`.
- Packs are **data + assets only, no scripts** (safe for Workshop content).
- All packs load through the same runtime loader (`GLTFDocument` for models, `Image` for
  textures), so built-in and user packs behave identically. Results are cached.
- Missing pack/prop → render a placeholder box and keep the data intact.

### Prop definition
```json
{
  "id": "campfire",
  "name": "Campfire",
  "category": "nature/fire",
  "themes": ["medieval", "camp", "wilderness"],
  "tags": ["fire", "light", "cooking"],
  "model": "assets/campfire.glb",
  "footprint": [1.0, 1.0],
  "placement": { "mode": "subgrid", "step": 0.5, "align": "ground", "rotate_snap_deg": 15 },
  "variants": [],
  "animations": { "autoplay": "burn" },
  "light": { "color": "#ffaa55", "energy": 1.5, "range": 6 },
  "attribution": {
    "author": "…",
    "source_url": "…",
    "license": "CC0-1.0",
    "license_url": "…",
    "notes": ""
  }
}
```
- `placement.mode`: `grid` | `subgrid` | `free`; `align`: `ground` | `surface` | `wall`.
  The user can override snapping while placing (modifier key, step selector).
- Building kits define `cell_size`, `wall_height`, and pieces per role
  (wall, corner, door, window, floor tile, stair, roof parts).

### Asset sourcing policy
- Allowed licenses: **CC0** and **CC-BY** (attribution stored in manifest; shown in credits).
  Not allowed: NonCommercial, ShareAlike, unclear/unspecified.
- Candidate sources: Kenney, Quaternius, KayKit (CC0); Poly Haven, ambientCG (CC0 textures);
  Poly Pizza (check per model — mixed CC0/CC-BY).
- Style consistency comes from the filter (pixelation + optional palette quantization).
- Every imported asset records its source URL and license at import time.

### Browser UI
- Category tree, theme filter chips, text search over name/tags/themes/category.
- Auto-generated, cached thumbnails (rendered with the active filter).
- Recents and favorites.

---

## 8. Rendering

### Camera
- Orthographic by default (perspective optional). Pan, zoom, orbit (free or 90° steps),
  pitch configurable; presets: top-down, isometric, ¾.
- **Texel snapping** of the camera in pixel mode to prevent pixel crawl while panning.

### Filter stack
- The 3D scene renders into a `SubViewport`. Filters are a chain of shader passes chosen per
  map (later per player), each with options.
- **Pixel filter** is special: renders the scene at low resolution then integer-upscales
  (nearest), with options for pixel size, palette quantization / dithering, and outlines
  (depth/normal edge detection).
- Other filters (oil paint, gothic, …) are screen-space shaders layered on top.
- Presets bundle a stack + options.

### Lighting / time of day
- Sun (`DirectionalLight3D`) + sky/environment driven by a time value.
- Modes: fixed time, or cycle with configurable day length (short/long/custom).
- Settings layering: app default → map default → (later) server default → player override.

### Animation
- Props are glTF scenes; animations autoplay as declared in the manifest, with per-instance
  phase offset. Shader-based motion (flags, foliage sway, water) and particles (fire, smoke)
  for cheap ambient animation.

### Performance
- Instances of the same prop are batched with `MultiMeshInstance3D` where possible.
- Chunks outside view are culled; far chunks can drop animations/lights.

---

## 9. Export (v1)
- **Snapshot:** current view at chosen resolution, with active filter → PNG.
- **Full-map top-down:** orthographic render of the occupied bounds, tiled and stitched (with a
  size cap / warning for huge maps).
- **Angle renders:** the whole map from preset or saved camera angles.
- Video / timelapse are deferred (likely Movie Maker frames + bundled ffmpeg).

---

## 10. Editor tools (v1)
- Select (click, box, add/remove), outliner list.
- Move / rotate / duplicate / delete, copy/paste, eyedropper (pick prop from map).
- Place prop (with snap mode override, surface placement, random rotation option).
- Terrain: raise/lower, smooth, flatten, set height; material paint; water body.
- Buildings: foundation paint/erase, wall edge tool, door/window, add/remove floor, roof style,
  level selector (cutaway).
- Grid overlay toggle, measurement readout, hotkeys.
- Branch panel: fork, switch, merge (conflict review), discard; history list.

---

## 11. Project structure
```
project.godot
src/
  core/      # pure data: document, objects, ops, txns, history, branches, serialization, uuid
  library/   # pack + manifest loading, runtime glTF loader, search index, thumbnails
  world/     # view nodes: chunk views, terrain mesh, prop instances, building mesh generation
  render/    # camera, filter pipeline, shaders, lighting / time of day
  editor/    # tools, input, selection, snapping, high-level commands → transactions
  ui/        # panels, prop browser, branch/history panel, settings, dialogs
  export/    # snapshot + map renders
packs/       # built-in packs (CC0 Kenney kits), .gdignore'd
tests/       # unit tests (GUT), run headless
tools/       # asset import / manifest helper scripts
docs/
```
`src/core` must not reference `Node` or any rendering API.

---

## 12. Milestones
| # | Milestone | Done when |
|---|---|---|
| M0 | Project skeleton | Godot project, folders, test runner works headless |
| M1 | Core data layer | Document, ops, transactions, undo/redo, branches + merge, save/load — all unit-tested |
| M2 | Viewport | Camera controls, sparse chunk view, grid, pixel filter + texel snapping, time of day |
| M3 | Prop library | Pack loader, small CC0 core pack, browser (category/theme/search), placement + snapping, selection/transform, credits screen |
| M4 | Terrain | Sculpt + paint brushes, triplanar materials, water bodies, rock/cliff props |
| M5 | Buildings | Kit manifest, foundations, walls, openings, floors, roofs, cutaway |
| M6 | Branch & history UI | Fork/switch/merge with conflict review, history panel |
| M7 | Filters & export | Filter stack + presets/options, snapshot, top-down, angle renders |
| M8 | v1 polish | Autosave/recovery, settings, performance pass, packaging for Win/macOS |

### Status
- **M0 done** — project skeleton, headless test runner (`tests/run_tests.gd`).
- **M1 done** — `src/core`: MapDocument, Ops, TerrainEdit, Transaction, Branch, MapSession,
  Merge, ProjectFile; 48 unit tests. Decisions made while building it:
  - Undo never touches properties of an object someone else deleted; restoring it brings the
    full object back.
  - Merging a branch folds it into its parent as one undoable transaction and removes the
    branch. A branch with sub-branches can't be merged until they're merged or discarded.
  - Terrain merge conflicts are keyed by world sample/cell, so a border sample shared by
    several chunks is one conflict and its copies can't diverge.
  - Branch switching replays history from the root. Periodic snapshot caching is deferred
    until histories get long enough to need it.
- **M2 done** — PixelView (low-res SubViewport, nearest upscale, sub-texel offset for smooth
  texel-snapped panning, color quantization + Bayer dither), CameraRig (ortho/perspective,
  orbit, zoom-at-cursor, presets, trackpad gestures), Ground grid shader, DayCycle, sparse
  WorldView with placeholder boxes, layered ViewSettings (player override → map default →
  built-in) with HUD panel, save/open/new, undo/redo shortcuts. Left-click placement of test
  boxes is temporary until M3.
- **M3 done** — three CC0 Kenney packs imported by `tools/import_kenney.gd` (522 props:
  Nature Kit, Fantasy Town Kit, Mini Characters; ×3 scale so 1 unit = 3 m walls / 2 m people).
  PropLibrary (manifest validation, license allow-list, category/theme/text search),
  ModelCache (runtime glTF, shared trimesh pick shapes, pack material overrides),
  ThumbnailRenderer (offscreen, cached PNGs), PropBrowser panel, PlaceTool (ghost, grid /
  subgrid / free snapping, surface placement with parent links, random rotation), SelectTool
  (click / shift / box select, drag-move, rotate, delete, duplicate, copy/paste, eyedropper,
  focus), selection highlight, animated props (characters idle), prop lights, credits dialog.
  Decisions:
  - Packs live in `packs/` with a `.gdignore`, so Godot never imports them; built-in and user
    packs share the runtime loader. (Export packaging of `packs/` is an M8 task.)
  - Grid-mode snapping centers footprints spanning an odd number of cells and puts even ones on
    grid lines; grid step comes from the manifest (3 m for Kenney modular pieces).
  - Surface placement only accepts mostly-upward faces (normal.y > 0.7); sloped roofs don't
    take props.
  - Box select includes children; duplicate/paste keep parent links inside the copied set.
- **M4 done** — terrain: per-chunk heightfield meshes (TerrainView) with a palette shader
  (8 flat-color materials, dithered 25 cm transitions, automatic rock on steep slopes),
  implicit ground plane with hole mask under edited chunks, heightfield raycast picking,
  TerrainTool (raise / lower / smooth / flatten / paint, brush ring, `[ ]` size, Shift+`[ ]`
  strength, one stroke = one undo step), water bodies (polygon relative to the object position
  so select/move/rotate/raise work; depth-tinted shader with shoreline foam), WaterTool
  (click corners, Enter / click first corner to finish), toolbar + terrain options panel.
  Decisions:
  - Unparented props standing on the terrain ride it up/down while sculpting (with their
    children), inside the same transaction.
  - Terrain materials are indices into a built-in palette (TerrainPalette); textures can
    replace the flat colors later without changing map data.
  - Rock/cliff props from the Nature Kit cover overhangs and cliff faces (option B).
- **M5 done** — modular buildings: kit manifests (`packs/<pack>/kits/*.json`: cell size, story
  height, wall/window/door/floor pieces, generated-part colors; Timber and Stone kits from the
  Fantasy Town Kit), BuildingLayout in `src/core` (path-keyed cells and per-edge overrides,
  automatic exterior walls, roof footprints), BuildingVisuals (kit pieces on edges, floor
  tiles, foundation, per-level pick bodies), procedural gable / hip / flat roofs (RoofMesh),
  BuildingTool (foundation / erase drag-painting, wall / door / window edge clicks, levels with
  cutaway, roof style, kit switch) and grid-snapped moving of buildings.
  Decisions:
  - Roofs are generated, not tiled from kit roof pieces: they fit any footprint (decomposed into
    rectangles; L-shapes become intersecting gables). Kenney roof pieces remain placeable props.
  - Painting a foundation on level 0 away from the current building starts a new one; erasing
    every cell deletes it.
  - Furniture placed on a building floor becomes the building's child and moves with it.
  - Stairs, balconies and per-level wall styles are later work.
- **M6 done** — branches & history UI: HistoryPanel (branch tree with New / Switch / Merge /
  Rename / Discard, history list newest-first with inherited entries dimmed, Undo / Redo,
  "Branch here" to fork from any earlier entry), MergeDialog (clean-change and conflict counts,
  one row per conflict with Keep / Take, terrain conflicts grouped per layer, Keep all / Take
  all), NameDialog, discard confirmation. Core additions: `MapSession.fork_at`, `rename_branch`,
  `history`.
  Decisions:
  - A branch started from an earlier entry begins with an empty undo stack (its parent's undo
    entries may refer to edits that aren't part of it).
  - Branch operations switch to the select tool first, so no tool holds ids from another branch.

### Web port
- **Step 1 done — core data layer** (`web/core`, package `@pixel-arena/core`): values, Godot-
  compatible JSON codec, document + spatial index, ops, terrain edit/raycast/brushes, transactions,
  per-author undo, branches, three-way merge, building layout, snapping, `.pxmap` read/write
  (fflate). 82 Vitest tests, all ported from the Godot suite plus codec tests. Cross-checked both
  ways: the TS core opens a Godot-saved project (`test/fixtures/godot-sample.pxmap`), replays it to
  exactly Godot's snapshot and merges its branch; Godot opens a TS-saved project, finds the TS
  edits, and undoes/redoes them.
  Decisions:
  - Values mirror Godot types (`Vec2`, `Vec2i`, `Vec3`, `Rect2i`, `PackedVec2Array`, typed
    arrays). JS numbers have no int/float split: generic numbers are written as floats, and ints
    only where the schema says so (sequence numbers, lamport, format version).
  - Terrain chunks are keyed by "x,y" strings in `Map`s; object props are `Map`s (insertion order).
  - `MapSession.edit()` cancels the transaction if the callback throws.
- **Step 2 done — renderer parity** (`web/app`, Vite + Svelte + three.js on `@pixel-arena/core`):
  opens any `.pxmap` and renders everything the document holds — instanced props, animated
  characters, prop lights, sculpted/painted terrain chunks with the ground plane cut around them,
  water, buildings with generated roofs and level cutaway — with the pixel filter, texel-snapped
  camera, depth + normal outlines and the day/night cycle. Verified against the Godot build by
  rendering the same demo map from the same camera (`web/app/fixtures/demo.pxmap`): same layout;
  remaining differences are lighting/tone tuning. Performance (M5 MacBook, 120 Hz): demo map 120 fps;
  2,000 props 120 fps zoomed in, 60 fps with the whole map in view.
  Decisions:
  - Static props are instanced per 128 m cell and prop kind: coarse enough to keep draw calls low,
    fine enough for frustum culling on big maps (32 m cells produced thousands of draws).
  - Animated characters are individual skinned clones; their animations advance at 15 Hz (a
    stop-motion look that suits pixel art) and only while on screen. This took 2,000-prop scenes
    with ~100 characters from 60 to 120 fps. Vertex-animation textures are the next step if maps
    need hundreds of visible characters.
  - Water depth comes from the terrain heightfield under the polygon (no depth-buffer read).
  - Outlines: depth Laplacian plus a low-res view-normal pass that only runs when outlines are on.
  - Known issue (Godot build, dev tooling only): `--demo --screenshot` hangs waiting for
    `frame_post_draw`; capture with a script that waits on frames instead.
- Next: editor tools in M3→M6 order (prop browser + placement, selection/transform, terrain and
  water tools, building tool, branches UI), then M7 (filters & export) and Electron/Steam.

Future: underground layers → co-op server (headless Godot reusing `src/core`) → share links →
web viewer (Godot web export of a viewer mode) → video/timelapse → Workshop.

---

## 13. Risks / open items
- **Art consistency** across free asset sources — mitigated by filter + palette; curate.
- **Pixel crawl / shimmer** in pixel mode — texel snapping and integer scaling from M2.
- **Terrain seams** across chunk borders — shared edge samples, normals computed across borders.
- **Huge exports** — tiled rendering, size caps.
- **Roof generation** for irregular footprints — flat fallback in v1.
- **Runtime glTF loading** speed — cache, async loading, thumbnails on demand.
