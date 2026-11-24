# Development notes

Everything lives in the npm workspace `web/`. Plan and architecture: [PLAN.md](PLAN.md).

## Commands
- Run the desktop app: double-click `Run Pixel Arena.command` (installs deps on first run, builds,
  starts Electron; extra args go to Electron, e.g. `--selftest=desktop`).
- Tests: `npm test --prefix web` (Vitest). Type-check: `npm run check --prefix web`.
- Web app in a browser: `npm run dev --prefix web` → http://localhost:5200 (`?map=/fixtures/demo.pxmap`;
  more URL params for automated shots/perf/self-tests are documented at the top of `web/app/src/App.svelte`).
- Desktop from npm: `npm run desktop --prefix web`; `npm run package --prefix web` → unsigned folders in
  `web/desktop/out/` (macOS arm64/x64, Windows x64). Self-test: `web/node_modules/.bin/electron web/desktop
  --selftest=desktop` (exits 0/1).
- Import third-party model packs (re-centered, measured, categorized; config in `web/tools/packs.config.mjs`):
  `node web/tools/import-packs.mjs <dir of unzipped downloads> [pack id ...]`. The `library` self-test
  checks every prop loads, is centered and matches its manifest size.
- Bake the premade building library (`packs/premade`) from the generator's recipes:
  `node --experimental-transform-types --import ./web/tools/ts-resolve.mjs web/tools/bake-premade.mjs`
  (the resolve hook lets Node run `web/core`'s TypeScript directly).
- npm here skips install scripts, so after a fresh install run `node web/node_modules/electron/install.js`
  if `web/node_modules/electron/dist` is missing (the launcher does this).

## Project rules
- Keep npm dependencies to a minimum.
- `web/core` (`@pixel-arena/core`) is pure data: no DOM or rendering APIs. It will be reused by a
  co-op server and a web viewer.
- The document changes only through ops applied inside a `MapSession` transaction.
- `.pxmap` stays readable: keep `web/core/test/fixtures/godot-sample.pxmap` passing (files saved by
  the old Godot build) and the codec in Godot's `JSON.from_native` format.
- Prop packs (`packs/`) are data + assets only; manifests are validated and only CC0 / CC-BY
  licenses load. Keep attribution in the manifest.
- UI consistency: follow [UI.md](UI.md) (one control per kind of decision, fixed panel order, one
  label column, hide vs disable, wording). Use the tokens and shared styles in `web/app/src/app.css`
  (`.field` rows, `.slider`, `.switch`, `.seg`, `.tiles`, `.choices`, `.list-row`, `.heading-row`,
  `.action-bar`, `.empty`, `.pop`, `.menu-list`, `button.on` / `.primary` / `.danger` / `.bare` /
  `.icon`, `.input`) instead of new per-component CSS; tool settings come only from the registry
  (`editor/tools.ts`); `ui/SearchField.svelte` for search; `ui/keys.ts` (`key`, `withKey`,
  `saveSlotKey`) for every shortcut shown in the UI. The `panels` self-test checks the main rules.
- Editor indicators (rings, outlines, axes, brush guides) never go through the pixel filters: use
  `render/overlay.ts` (`overlayLine`, `toOverlay`); see [UI.md](UI.md).
- three.js gotcha: materials that share an `onBeforeCompile` closure share one compiled program
  unless they set `customProgramCacheKey` — always set it when injecting different shader code.
