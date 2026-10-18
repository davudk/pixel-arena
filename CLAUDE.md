# Pixel Arena

Godot 4.7 (standard, GDScript) map editor. Plan and architecture: `docs/PLAN.md`.

## Commands
- Run the app: double-click `Run Pixel Arena.command` (or `./Run\ Pixel\ Arena.command --editor`).
  App flags after `--`: `--demo`, `--screenshot=<png>`, `--view=<key>=<value>`, `--camera=<x>,<z>,<zoom>`.
- Import / refresh class cache (needed after adding a `class_name`):
  `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --import`
- Run tests: `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . -s tests/run_tests.gd`
  (optional filter after `--`, e.g. `-- test_branches`)
- Editor smoke test (drives tools end to end): `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . -s tests/smoke_editor.gd`
- Re-import a Kenney pack: `... -s tools/import_kenney.gd -- <nature|town|characters> <glb dir> <License.txt>`

## Web port (`web/`)
- npm workspace; `web/core` is the pure-data core (`@pixel-arena/core`), ported from `src/core`.
- Tests: `npm test --prefix web` (Vitest). Type-check: `npm run check --prefix web`.
- Run the web app: `npm run dev --prefix web` → http://localhost:5200 (`?map=/fixtures/demo.pxmap`;
  more URL params for automated shots/perf are documented at the top of `web/app/src/App.svelte`).
- Desktop (Electron + Steam, `web/desktop`): `npm run desktop --prefix web` (builds the app, opens it);
  `npm run package --prefix web` → unsigned folders in `web/desktop/out/` (macOS arm64/x64, Windows x64).
  Self-test: `web/node_modules/.bin/electron web/desktop --selftest=desktop` (exits 0/1).
  npm here skips install scripts, so after a fresh install run `node web/node_modules/electron/install.js`
  if `web/node_modules/electron/dist` is missing.
- three.js gotcha: materials that share an `onBeforeCompile` closure share one compiled program
  unless they set `customProgramCacheKey` — always set it when injecting different shader code.
- `.pxmap` compatibility with the Godot build is a requirement: keep `test/fixtures/godot-sample.pxmap`
  passing, and keep the codec in Godot's `JSON.from_native` format.
- Ask before adding npm dependencies.

## Rules
- `src/core` is pure data: no `Node`, scene tree, or rendering APIs. It will be reused by a
  headless co-op server and a web viewer.
- The document changes only through ops (`Ops`) applied inside a `MapSession` transaction.
- Prop packs (`packs/`) are data + assets only; manifests are validated and only CC0 / CC-BY
  licenses load. Keep attribution in the manifest.
- GDScript lambdas capture locals by value: collect results from `session.edit(...)` callbacks
  through an Array/Dictionary, not by assigning an outer local.
- Tests live in `tests/test_*.gd`, extend `TestCase`, and use `check*` helpers.
