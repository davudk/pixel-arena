# Pixel Arena

Pixel-art 3D map editor: TypeScript + three.js, Svelte UI, Electron + Steam for desktop.
Plan and architecture: `docs/PLAN.md`. Everything lives in the npm workspace `web/`.

## Commands
- Run the desktop app: double-click `Run Pixel Arena.command` (installs deps on first run, builds,
  starts Electron; extra args go to Electron, e.g. `--selftest=desktop`).
- Tests: `npm test --prefix web` (Vitest). Type-check: `npm run check --prefix web`.
- Web app in a browser: `npm run dev --prefix web` → http://localhost:5200 (`?map=/fixtures/demo.pxmap`;
  more URL params for automated shots/perf/self-tests are documented at the top of `web/app/src/App.svelte`).
- Desktop from npm: `npm run desktop --prefix web`; `npm run package --prefix web` → unsigned folders in
  `web/desktop/out/` (macOS arm64/x64, Windows x64). Self-test: `web/node_modules/.bin/electron web/desktop
  --selftest=desktop` (exits 0/1).
- npm here skips install scripts, so after a fresh install run `node web/node_modules/electron/install.js`
  if `web/node_modules/electron/dist` is missing (the launcher does this).

## Rules
- Ask before adding npm dependencies.
- `web/core` (`@pixel-arena/core`) is pure data: no DOM or rendering APIs. It will be reused by a
  co-op server and a web viewer.
- The document changes only through ops applied inside a `MapSession` transaction.
- `.pxmap` stays readable: keep `web/core/test/fixtures/godot-sample.pxmap` passing (files saved by
  the old Godot build) and the codec in Godot's `JSON.from_native` format.
- Prop packs (`packs/`) are data + assets only; manifests are validated and only CC0 / CC-BY
  licenses load. Keep attribution in the manifest.
- UI consistency: use the tokens and shared styles in `web/app/src/app.css` (`.heading`, `.section`,
  `.field` / `.field.stack`, `.check`, `.seg`, `.tiles` / `.tile`, `.choices` / `.choice`, `.swatch`,
  `.list-row`, `.group-head`, `.count`, `.empty`, `.pop`, `.menu-list`, `button.on` / `.primary` /
  `.danger` / `.bare` / `.icon`, `.input`) instead of new per-component CSS; `ui/SearchField.svelte`
  for search; `ui/keys.ts` (`key`, `withKey`, `saveSlotKey`) for every shortcut shown in the UI.
  Wording: sentence case, "Group by" / "Sort by", American spelling, no full stop on empty states.
- three.js gotcha: materials that share an `onBeforeCompile` closure share one compiled program
  unless they set `customProgramCacheKey` — always set it when injecting different shader code.
