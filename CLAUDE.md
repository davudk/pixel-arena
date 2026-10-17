# Pixel Arena

Godot 4.7 (standard, GDScript) map editor. Plan and architecture: `docs/PLAN.md`.

## Commands
- Run the app: double-click `Run Pixel Arena.command` (or `./Run\ Pixel\ Arena.command --editor`).
  App flags after `--`: `--demo`, `--screenshot=<png>`, `--view=<key>=<value>`.
- Import / refresh class cache (needed after adding a `class_name`):
  `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --import`
- Run tests: `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . -s tests/run_tests.gd`
  (optional filter after `--`, e.g. `-- test_branches`)

## Rules
- `src/core` is pure data: no `Node`, scene tree, or rendering APIs. It will be reused by a
  headless co-op server and a web viewer.
- The document changes only through ops (`Ops`) applied inside a `MapSession` transaction.
- Tests live in `tests/test_*.gd`, extend `TestCase`, and use `check*` helpers.
