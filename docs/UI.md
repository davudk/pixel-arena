# UI guidelines

How Pixel Arena's interface is put together, so every panel looks and behaves the same. The shared
styles live in `web/app/src/app.css`; tool settings are drawn from the registry in
`web/app/src/editor/tools.ts`. The `panels` self-test checks the main rules
(`web/node_modules/.bin/electron web/desktop --selftest=panels`, shots in `web/app/shots/panels-*.png`).

## Layout

- **Rail** (left edge): the modes. Clicking the active mode collapses its catalogue.
- **Tools container** (left, top): what you're holding and how. It is hidden in Select mode. With the
  catalogue collapsed, it is shown only while a tool is in hand.
- **Catalogue** (left, below, 8 px apart): what you can apply, and what of it is already in the map.
- **Selection** (right, under the top bar): the selected object's properties. It is shown only while
  something is selected, and it is the only place existing objects are edited.
- **Top bar**: file, undo and redo, History (dialog), Walk, View (popover), and the panel toggles.
- **Rare tasks** open as a popover (View, list options, filters, themes) or a dialog (History, Export).
- **Tab** hides everything.

## One control per kind of decision

| Decision | Control | Class / source |
|---|---|---|
| Which tool of this mode (2–4) | Full-width segmented control with icons, at the top of the tools container | `.seg` (ToolsBox) |
| What you apply (effect, material, liquid, piece, kit, prop) | One full-width grid per section, in one style: icon tiles, swatch choices or cards | `.tiles`, `.choices`, prop cards |
| A setting (how) | A row: label in the `--label-w` column, one control | `.field` |
| …a number | Slider with an editable value and unit; snap marks only for ranges spanning orders of magnitude (brush size) | `.slider`, `ParamDef.presets` |
| …on / off | Switch | `.switch` |
| …one of a few | Segmented control | `.seg` |
| …one of many, or from data | Select | `select` |
| …a whole number with steps | − value + | `ParamDef kind: 'stepper'` |
| …X / Y / Z | Vector field (label above: the control is a grid) | `.field.stack` + `.vector` |
| Things already in the map | List rows: picture, name, details on the right; actions on hover | `.list-row` |
| An action | Icon button in a heading row, or up to three equal buttons; more go in a … menu | `.heading-row`, `.action-bar`, `.menu-list` |

Don't: preset button rows, free-floating toggle buttons, labels inside controls (except steppers'
numbers), radios, more than one grid style in a section.

## Order (every mode)

1. **Tools container:** tool switch, then the current-tool card (picture, name, kind; ≡ menu with
   saved-tool actions, × puts the tool down), then the settings, in registry order, then saved tools
   in one scrolling row.
2. **Catalogue:** what you apply (headed by its noun: Effect, Material, Liquid, Piece, Kit), then
   "In this map" lists.
3. **Object properties** (kit, roof, liquid, name, position) only in Selection.

Settings show for the tool in hand, or the mode's last tool when nothing is in hand, so it can be set
up before you pick it up. Clicking a catalogue item always picks the tool up with it (never puts it
down); × or Esc puts it down.

## Hidden or disabled

- **Hide** a setting when the reason is a choice made right there:
  - another variant of the tool (`ParamDef.hide`, e.g. Size for polygon water);
  - a switch that is off (`ParamDef.parent`): such settings are indented under that switch.
- **Disable** only when the reason is elsewhere (`ParamDef.applies` + `why`), and show the reason
  as text in the row, not only in a tooltip.

## Grid, size, spacing

- **Width:** everything is full width of its column. Only icon buttons and links are their own width.
- **Grids:**
  - Tiles: `auto-fit`, at most 4 on one row.
  - Choices: always 2 columns.
  - Never leave a 3 + 2 row: change the control instead.
- **Labels:** one label column, `--label-w` (76 px), beside the control everywhere, popovers and
  dialogs included. Keep labels to about 12 characters ("Levels", not "Visible levels"). Never
  override `--label-w` in a component.
- **Heights and gaps:** one control height (`--control-h`, 28 px). Gaps: 4 px inside grids, 6 px
  between rows, 16 px between sections.
- **Accent** means "in hand or current": the armed tool, the current catalogue choice, the mode,
  an open panel's button, a changed view setting. A setting's value uses the plain segmented
  "on" look.

## Words

- Sentence case; American spelling; "Group by" / "Sort by".
- No full stop on empty states. Empty states read "No … yet" or "Nothing …", centered (`.empty`).
- One meaning per word:
  - "View" is the eye popover; lists have "List options".
  - "Shape" is polygon/brush; sculpting has "Effect".
- Write real labels, never CSS-capitalized ids.
- Icons from `ui/Icon.svelte`, never Unicode symbols.
- Shortcuts shown in the UI come from `ui/keys.ts` (`key`, `withKey`, `saveSlotKey`).

## Adding a tool or setting

1. Add the tool to `TOOLS` in `editor/tools.ts`.
2. Its settings are `ParamDef`s: the kind picks the control, and the order is the order shown.
   - `detail` makes a choice a setting instead of a catalogue.
   - `parent` nests it under a switch.
   - `hide` / `applies` follow the rules above.
3. If its mode has more than one tool, add it to the switch in `ui/ToolsBox.svelte`.
4. Never hand-place a setting in a panel.
