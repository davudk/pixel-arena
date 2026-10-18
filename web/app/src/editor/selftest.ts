// End-to-end self-tests that drive the real editor code in the browser (the web counterpart of
// tests/smoke_editor.gd). Run with ?selftest=place; results go to web/app/shots/selftest-<name>.json
// (dev server) and the page title becomes "SELFTEST PASS" / "SELFTEST FAIL".

import * as THREE from 'three'
import { BuildingLayout, MAIN, MapSession, merge, openProject, Rect2i, saveProject, terrainEdit, Vec3 } from '@pixel-arena/core'
import { buildReview, resolutions } from '../ui/merge-review'
import type { ViewSettings } from '../render/view-settings'
import type { Exporter } from '../render/exporter'
import { PRESET_ORDER } from '../render/filters'
import type { Editor, Pointer } from './editor'
import { PlaceTool } from './place-tool'
import { SelectTool } from './select-tool'
import { TerrainTool } from './terrain-tool'
import { params as toolParams, paramsChanged, setParams } from './tool-params'
import { inHand, pickUp, putDown } from './tools'
import { activeId, describe, saveTool, useSaved } from '../ui/saved-tools'
import { ui } from '../ui/ui-state.svelte'
import { WaterTool } from './water-tool'
import { LIQUIDS } from '../world/liquids'
import { BuildingTool } from './building-tool'
import { desktop } from '../platform'
import { WheelClassifier } from './gestures'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** App pieces some tests need beyond the editor. */
export interface SelfTestExtras {
  settings: ViewSettings
  exporter: Exporter
  canvas: HTMLCanvasElement
  /** Opens .pxmap bytes the way the app does (binds every view). */
  open: (bytes: Uint8Array, name: string) => void
  /** The app's own file handling (desktop build). */
  files: {
    save: () => Promise<void>
    path: () => string | null
    setPath: (path: string | null) => void
    openPath: (path: string) => Promise<void>
    dirty: () => boolean
    name: () => string
  }
}

export async function runSelfTest(name: string, editor: Editor, busy: () => boolean, extras: SelfTestExtras) {
  const failures: string[] = []
  const report: Record<string, unknown> = {}
  const check = (ok: unknown, what: string) => {
    if (!ok) failures.push(what)
  }
  const settle = async () => {
    await sleep(100)
    for (let i = 0; i < 100 && busy(); i++) await sleep(50)
    await sleep(150)
  }
  try {
    if (name === 'place') await placeTest(editor, check, settle)
    else if (name === 'select') await selectTest(editor, check, settle)
    else if (name === 'terrain') await terrainTest(editor, check, settle)
    else if (name === 'building') await buildingTest(editor, check, settle)
    else if (name === 'branches') await branchesTest(editor, check, settle)
    else if (name === 'branches-ui') await branchesUi(editor, check, settle)
    else if (name === 'filters') await filtersTest(editor, check, settle, extras)
    else if (name === 'export') await exportTest(editor, check, settle, extras)
    else if (name === 'gestures') await gesturesTest(editor, check, settle, extras)
    else if (name === 'tools') await toolsTest(editor, check, settle)
    else if (name === 'water') await waterTest(editor, check, settle, extras)
    else if (name === 'desktop') await desktopTest(editor, check, settle, extras, report)
    else failures.push(`unknown self-test '${name}'`)
  } catch (e) {
    failures.push(`exception: ${(e as Error).stack ?? e}`)
  }
  const result = { test: name, pass: failures.length === 0, failures, ...report }
  console.log('selftest', result)
  await fetch(`/__save?name=selftest-${name}.json`, {
    method: 'POST', body: 'data:application/json;base64,' + btoa(JSON.stringify(result, null, 2)),
  }).catch(() => {})
  document.title = result.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL'
  desktop?.test?.done(result.pass)
}

async function placeTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const { library, session: s, rig, pixel } = editor
  rig.focus.set(0, 0, 0)
  rig.zoom = 30
  await settle()
  const at = (v: THREE.Vector3): Pointer => {
    const p = pixel.toScreen(v, rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
  }
  const props = () => [...s.doc.objects.values()].filter((o) => o.type === 'prop' && !o.deleted)

  // Place a flat-topped stump near the origin: snapped to the 0.5 m subgrid, on the terrain.
  const stumpDef = library.props.get('kenney_nature:stump_square_detailed_wide')!
  const place = new PlaceTool(editor, stumpDef)
  editor.setTool(place)
  await settle()
  const spot = at(new THREE.Vector3(0.3, 0, 0.2))
  place.pointerMove(spot)
  place.pointerDown(spot)
  check(props().length === 1, `stump placed (got ${props().length})`)
  const stump = props()[0]
  const pos = stump.props.get('position') as Vec3
  check(Math.abs(pos.x / 0.5 - Math.round(pos.x / 0.5)) < 1e-9 && Math.abs(pos.z / 0.5 - Math.round(pos.z / 0.5)) < 1e-9, `snapped to 0.5 m: ${pos.x},${pos.z}`)
  await settle()

  // Picking finds it (through the instanced mesh).
  const top = at(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z))
  check(editor.pick(top)?.id === stump.id, 'pick finds the stump')

  // A pot placed on the stump's top becomes its child and sits on the surface.
  const pot = new PlaceTool(editor, library.props.get('kenney_nature:pot_small')!)
  editor.setTool(pot)
  await settle()
  pot.pointerMove(top)
  pot.pointerDown(top)
  const potObj = props().find((o) => o.props.get('prop') === 'kenney_nature:pot_small')
  check(potObj?.props.get('parent') === stump.id, 'pot is parented to the stump')
  check(Number((potObj?.props.get('position') as Vec3 | undefined)?.y ?? 0) > 0.1, 'pot raised onto the stump')

  // R rotates the ghost by the prop's snap angle; placements use it.
  pot.key(new KeyboardEvent('keydown', { key: 'r' }))
  check(Math.abs(pot.yaw - (15 * Math.PI) / 180) < 1e-9, `R rotates 15 deg (yaw ${pot.yaw})`)

  // Undo / redo.
  s.undo()
  check(props().length === 1, 'undo removes the pot')
  s.redo()
  check(props().length === 2, 'redo brings it back')

  // Grid props snap to their 3 m grid with footprint parity (thin wall -> cell center).
  const wall = new PlaceTool(editor, library.props.get('kenney_town:wall_wood')!)
  editor.setTool(wall)
  await settle()
  const wp = at(new THREE.Vector3(10.2, 0, -7.7))
  wall.pointerMove(wp)
  wall.pointerDown(wp)
  const wallObj = props().find((o) => o.props.get('prop') === 'kenney_town:wall_wood')
  const w = wallObj?.props.get('position') as Vec3 | undefined
  check(w && Math.abs(((w.x - 1.5) / 3) % 1) < 1e-9 && Math.abs(((w.z - 1.5) / 3) % 1) < 1e-9, `wall snapped to 3 m cell centers: ${w?.x},${w?.z}`)

  // Esc leaves the tool; save/open round-trips everything.
  wall.key(new KeyboardEvent('keydown', { key: 'Escape' }))
  check(editor.tool.name === 'select', 'Esc returns to the select tool')
  const reopened = openProject(saveProject(s))
  check(merge.diff(s.doc, reopened.doc).size === 0, 'save/open round trip')
}

async function selectTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const { library, session: s, rig, pixel, selection } = editor
  rig.focus.set(0, 0, 0)
  rig.zoom = 30
  await settle()
  const ptr = (v: THREE.Vector3, extra: Partial<Pointer> = {}): Pointer => {
    const p = pixel.toScreen(v, rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false, ...extra }
  }
  const moved = (p: Pointer, dx: number, dy: number): Pointer => ({ ...p, x: p.x + dx, y: p.y + dy })
  const key = (k: string, mods: KeyboardEventInit = {}) => editor.tool.key?.(new KeyboardEvent('keydown', { key: k, ...mods }))
  const props = () => [...s.doc.objects.values()].filter((o) => o.type === 'prop' && !o.deleted)
  const placeAt = async (propId: string, at: Pointer) => {
    const tool = new PlaceTool(editor, library.props.get(propId)!)
    editor.setTool(tool)
    await settle()
    tool.pointerMove(at)
    tool.pointerDown(at)
    editor.setTool(new SelectTool(editor))
    await settle()
  }

  await placeAt('kenney_nature:stump_square_detailed_wide', ptr(new THREE.Vector3(0, 0, 0)))
  const stump = props()[0]
  const pos = () => s.doc.getProp(stump.id, 'position') as Vec3
  const top = () => ptr(new THREE.Vector3(pos().x, pos().y + 0.3, pos().z))
  const tool = editor.tool as SelectTool
  check(editor.tool.name === 'select', 'select tool active')

  // Click selects; R rotates by the prop's snap; undo.
  tool.pointerDown(top())
  tool.pointerUp(top())
  check(selection.list().join() === stump.id, 'click selects the stump')
  key('r')
  check(Math.abs(Number(s.doc.getProp(stump.id, 'rotation')) - (15 * Math.PI) / 180) < 1e-9, 'R rotates 15 deg')
  s.undo()
  check(Number(s.doc.getProp(stump.id, 'rotation')) === 0, 'undo rotation')
  await settle()
  check(editor.world.highlightRoot.children.length === 1, 'selected object is highlighted')

  // Drag-move (grab the stump, drag 150 px right).
  const before = pos()
  const grab = top()
  tool.pointerDown(grab)
  tool.pointerMove(moved(grab, 40, 0))
  tool.pointerMove(moved(grab, 150, 0))
  tool.pointerUp(moved(grab, 150, 0))
  check(before.distanceTo(pos()) > 1, `drag moved the stump ${before.x},${before.z} -> ${pos().x},${pos().z}`)
  check(Math.abs(pos().x * 2 - Math.round(pos().x * 2)) < 1e-9, 'move snapped to 0.5 m')
  await settle()

  // A pot on top; duplicate copies stump + pot; delete removes both; undo restores.
  await placeAt('kenney_nature:pot_small', top())
  const pot = props().find((o) => o.props.get('prop') === 'kenney_nature:pot_small')!
  check(pot.props.get('parent') === stump.id, 'pot parented to stump')
  selection.set([stump.id])
  key('d', { metaKey: true })
  check(props().length === 4, `Cmd+D duplicates stump and pot (got ${props().length})`)
  check(selection.size === 1 && !selection.has(stump.id), 'duplicate selects the copy')
  const copyPot = props().find((o) => o.id !== pot.id && o.props.get('prop') === 'kenney_nature:pot_small')
  check(copyPot && copyPot.props.get('parent') === selection.list()[0], 'copied pot parented to the copied stump')
  selection.set([stump.id])
  key('Delete')
  check(props().length === 2, `Delete removes stump and pot (got ${props().length})`)
  s.undo()
  check(props().length === 4, 'undo restores them')
  await settle()

  // Box select the whole viewport.
  const corner = { x: 2, y: 2, shift: false, alt: false, cmd: false }
  const far = { x: pixel.out.x / devicePixelRatio - 2, y: pixel.out.y / devicePixelRatio - 2, shift: false, alt: false, cmd: false }
  tool.pointerDown(corner)
  tool.pointerMove(far)
  tool.pointerUp(far)
  check(selection.size === 4, `box select (got ${selection.size})`)
  rig.focus.set(pos().x - 1, 0, pos().z)
  rig.zoom = 14
  await settle()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await fetch('/__save?name=selftest-select.png', { method: 'POST', body: pixel.renderer.domElement.toDataURL('image/png') }).catch(() => {})
  rig.zoom = 30
  rig.focus.set(0, 0, 0)
  await settle()

  // Copy / paste at another spot keeps parent links.
  key('c', { metaKey: true })
  editor.cursor = ptr(new THREE.Vector3(-6, 0, 4))
  key('v', { metaKey: true })
  check(props().length === 8, `paste (got ${props().length})`)

  // Esc clears; I picks the prop under the cursor into the place tool.
  key('Escape')
  check(selection.size === 0, 'Esc clears the selection')
  await settle()
  editor.cursor = top()
  key('i')
  check(editor.tool instanceof PlaceTool && (editor.tool as PlaceTool).prop.id === 'kenney_nature:pot_small', 'I picks the pot into the place tool')
}

async function terrainTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const { library, session: s, rig, pixel, world } = editor
  rig.focus.set(0, 0, 0)
  rig.zoom = 30
  await settle()
  const ptr = (v: THREE.Vector3): Pointer => {
    const p = pixel.toScreen(v, rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
  }
  const doc = s.doc

  // A tree on the ground, then a raise stroke under it: the tree rides the terrain.
  const place = new PlaceTool(editor, library.props.get('kenney_nature:tree_oak')!)
  editor.setTool(place)
  await settle()
  const spot = ptr(new THREE.Vector3(2, 0, 2))
  place.pointerMove(spot)
  place.pointerDown(spot)
  const tree = [...doc.objects.values()].find((o) => o.props.get('prop') === 'kenney_nature:tree_oak')!
  const treeY = (tree.props.get('position') as Vec3).y

  const terrain = new TerrainTool(editor, 'sculpt')
  editor.setTool(terrain)
  setParams('sculpt', { op: 'raise', radius: 5, strength: 1 })
  editor.cursor = spot
  terrain.pointerDown(spot)
  for (let i = 0; i < 20; i++) terrain.update(1 / 60)
  terrain.pointerUp()
  const tp = doc.getProp(tree.id, 'position') as Vec3
  const groundY = terrainEdit.heightAtWorld(doc, tp.x, tp.z)
  check(groundY > 1, `terrain raised (${groundY.toFixed(2)})`)
  check(s.branch().txns.at(-1)?.label === 'Raise terrain', `history label (${s.branch().txns.at(-1)?.label})`)
  check(Math.abs(tp.y - groundY) < 0.01, `tree rides the terrain (${tp.y.toFixed(2)} vs ${groundY.toFixed(2)})`)
  await settle()
  check(doc.terrain.size > 0, 'terrain chunk stored')
  s.undo()
  check(Math.abs((doc.getProp(tree.id, 'position') as Vec3).y - treeY) < 1e-9, 'undo lowers the tree')
  check(doc.terrain.size === 0, 'undo removes the terrain chunk')

  // Paint sand (its own tool, with its own size).
  const painter = new TerrainTool(editor, 'paint')
  editor.setTool(painter)
  setParams('paint', { material: 2, radius: 5 })
  painter.pointerDown(spot)
  painter.pointerUp()
  const g = editor.groundAt(spot)!
  check(terrainEdit.materialAt(doc, Math.floor(g.x), Math.floor(g.z)) === 2, 'painted sand')
  check(s.branch().txns.at(-1)?.label === 'Paint Sand', `paint history label (${s.branch().txns.at(-1)?.label})`)

  // [ shrinks the paint brush (only) and notifies the panels.
  let notified = false
  const off = paramsChanged.connect((t) => (notified = t === 'paint'))
  const r0 = toolParams.paint.radius
  const sculptR = toolParams.sculpt.radius
  painter.key(new KeyboardEvent('keydown', { key: '[' }))
  off()
  check(toolParams.paint.radius < r0 && notified, '[ shrinks the brush')
  check(toolParams.sculpt.radius === sculptR, 'the sculpt brush keeps its size')

  // Water: three corners + Enter -> created, selected, back to the select tool; PageUp raises it.
  const water = new WaterTool(editor)
  editor.setTool(water)
  for (const c of [new THREE.Vector3(-8, 0, -4), new THREE.Vector3(-2, 0, -4), new THREE.Vector3(-5, 0, 1)]) {
    const p = ptr(c)
    water.pointerMove(p)
    water.pointerDown(p)
  }
  water.key(new KeyboardEvent('keydown', { key: 'Enter' }))
  const ids = editor.selection.list()
  const obj = ids.length === 1 ? doc.getObject(ids[0]) : undefined
  check(obj?.type === 'water', 'water created and selected')
  check(editor.tool.name === 'select', 'back to the select tool')
  const y0 = (obj?.props.get('position') as Vec3 | undefined)?.y ?? NaN
  editor.tool.key?.(new KeyboardEvent('keydown', { key: 'PageUp' }))
  check(Math.abs((doc.getProp(ids[0], 'position') as Vec3).y - y0 - 0.25) < 1e-9, 'PageUp raises the water by 0.25 m')
  await settle()
  check(world.highlightRoot.children.length === 1, 'water rendered and highlighted')
}

async function buildingTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const { session: s, rig, pixel, world, selection } = editor
  rig.focus.set(-8, 0, -8)
  rig.zoom = 34
  await settle()
  const at = (v: THREE.Vector3): Pointer => {
    const p = pixel.toScreen(v, rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
  }
  const doc = s.doc
  const tool = new BuildingTool(editor)
  editor.setTool(tool)
  setParams('build', { piece: 'foundation' })
  tool.setLevel(0)
  check(world.cutawayLevel === 0, 'cutaway follows the level')

  // Paint three cells in a row -> a new building with 8 exterior walls, selected.
  const origin = new THREE.Vector3(-15, 0, -15)
  const a = at(origin.clone().add(new THREE.Vector3(1.5, 0, 1.5)))
  tool.pointerDown(a)
  tool.pointerMove(at(origin.clone().add(new THREE.Vector3(4.5, 0, 1.5))))
  tool.pointerMove(at(origin.clone().add(new THREE.Vector3(7.5, 0, 1.5))))
  tool.pointerUp()
  const id = tool.target
  check(id && doc.getObject(id)?.type === 'building', 'building created')
  let layout = BuildingLayout.fromObject(doc.getObject(id)!)
  check(layout.cells(0).size === 3, `3 cells painted (got ${layout.cells(0).size})`)
  check(layout.walls(0).size === 8, `8 exterior walls (got ${layout.walls(0).size})`)
  check(selection.list().join() === id, 'building selected')
  const bpos = doc.getProp(id, 'position') as Vec3
  const b = (x: number, y: number, z: number) => new THREE.Vector3(bpos.x + x, bpos.y + y, bpos.z + z)

  // Door on the south edge of the middle cell.
  setParams('build', { piece: 'door' })
  tool.pointerDown(at(b(4.5, 1, 3)))
  layout = BuildingLayout.fromObject(doc.getObject(id)!)
  check([...layout.walls(0).values()].some((w) => w.kind === 'door'), 'door placed')

  // Level 1: one cell; the roof over level 1 is cut away while editing it.
  setParams('build', { piece: 'foundation' })
  tool.setLevel(1)
  const up = at(b(1.5, 3, 1.5))
  tool.pointerDown(up)
  tool.pointerUp()
  layout = BuildingLayout.fromObject(doc.getObject(id)!)
  check(layout.cells(1).size === 1, `level 1 cell (got ${layout.cells(1).size})`)
  await settle()
  const root = world.objectRoot(id)
  const roof1 = root?.children.find((c) => c.userData.roofLevel === 1)
  check(roof1 && !roof1.visible, 'roof over level 1 hidden while editing level 1')
  const level1 = root?.children.find((c) => c.userData.level === 1)
  check(level1?.visible, 'level 1 visible')

  // Roof style is one undoable edit.
  tool.setRoof('hip')
  check(doc.getProp(id, 'roof/style') === 'hip', 'roof style set')
  s.undo()
  check(doc.getProp(id, 'roof/style') === 'gable', 'undo roof style')

  // Erasing every cell deletes the building; undo brings it back.
  setParams('build', { piece: 'erase' })
  tool.pointerDown(up)
  tool.pointerUp()
  tool.setLevel(0)
  tool.pointerDown(a)
  tool.pointerMove(at(b(4.5, 0, 1.5)))
  tool.pointerMove(at(b(7.5, 0, 1.5)))
  tool.pointerUp()
  check(!doc.hasObject(id), 'erasing every cell deletes the building')
  s.undo()
  check(doc.hasObject(id), 'undo brings it back')

  // Leaving the tool restores the view's cutaway setting.
  editor.setTool(editor.defaultTool())
  check(world.cutawayLevel === editor.viewCutaway, 'cutaway restored on leaving the tool')
}

async function branchesTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const { library } = editor
  const s = () => editor.session
  let stump = ''
  s().edit('Place stump', () => (stump = s().createObject('prop', { prop: 'kenney_nature:stump_square_detailed_wide', position: new Vec3(0, 0, 0) })))

  // Fork, edit on the branch, switch back: main doesn't see the branch's edits.
  const exp = editor.newBranch(s().currentBranch, -1, 'Experiment')
  check(s().branches.get(exp)?.name === 'Experiment' && s().currentBranch === exp, 'branch created and current')
  s().edit('Paint red', () => s().setProp(stump, 'variant', 'red'))
  let rock = ''
  s().edit('Add rock', () => (rock = s().createObject('prop', { prop: 'kenney_nature:rock_large_a', position: new Vec3(6, 0, 6) })))
  editor.switchBranch(MAIN)
  check(!s().doc.hasObject(rock), "main doesn't see branch edits")
  s().edit('Paint blue', () => s().setProp(stump, 'variant', 'blue'))

  // Review: one conflict row (variant); keep ours; the rock merges cleanly.
  const review = buildReview(s(), exp, library)
  check(review.rows.length === 1 && review.conflicts === 1, `one conflict row (got ${review.rows.length})`)
  check(review.rows[0]?.mine === 'blue' && review.rows[0]?.theirs === 'red', 'conflict shows both values')
  editor.mergeBranch(exp, resolutions(review.rows, [false]))
  check(!s().branches.has(exp), 'merged branch removed')
  check(s().doc.getProp(stump, 'variant') === 'blue', 'kept ours on the conflict')
  check(s().doc.hasObject(rock), 'non-conflicting change merged')
  check(merge.diff(s().doc, s().materialize(s().currentBranch)).size === 0, 'document matches history after merge')

  // Branch from an earlier history entry (before the merge).
  const older = s().history(MAIN).find((h) => h.txn.label === 'Paint blue')!
  editor.newBranch(older.branchId, older.seq, 'From history')
  check(s().branch().forkSeq === older.seq, 'branched at the history entry')
  check(!s().doc.hasObject(rock), 'older state shown')

  // The panel lists both branches; undoing the merge works from main.
  await settle()
  const items = document.querySelectorAll('.history .branches li')
  check(items.length === 2, `panel lists 2 branches (got ${items.length})`)
  // "From history" inherits main's first two entries (Place stump, Paint blue) and has none of its own.
  const entries = document.querySelectorAll('.history .list li')
  check(entries.length === 2, `panel lists the branch's history (got ${entries.length})`)
  editor.switchBranch(MAIN)
  s().undo()
  check(!s().doc.hasObject(rock), 'undo reverts the whole merge')
}

/** Leaves the UI showing a branch tree, history and an open merge review (for screenshots); it
 *  clicks the real panel buttons, so it also checks they're wired. */
async function branchesUi(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const s = () => editor.session
  const ids: string[] = []
  s().edit('Place trees', () => {
    for (let i = 0; i < 3; i++) ids.push(s().createObject('prop', { prop: 'kenney_nature:tree_oak', position: new Vec3(i * 3, 0, 0) }))
  })
  const autumn = editor.newBranch(s().currentBranch, -1, 'Autumn version')
  s().edit('Recolor trees', () => ids.forEach((id) => s().setProp(id, 'variant', 'autumn')))
  s().edit('Move tree', () => s().setProp(ids[0], 'position', new Vec3(-4, 0, 2)))
  editor.switchBranch(MAIN)
  editor.newBranch(MAIN, -1, 'Night market')
  editor.switchBranch(MAIN)
  s().edit('Recolor trees', () => ids.slice(0, 2).forEach((id) => s().setProp(id, 'variant', 'summer')))
  await settle()
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.history .branches li button')]
  const row = rows.find((b) => b.textContent?.includes('Autumn version'))
  check(row, 'branch row shown')
  row?.click()
  await settle()
  const mergeButton = [...document.querySelectorAll<HTMLButtonElement>('.history .actions button')].find((b) => b.textContent?.startsWith('Merge'))
  check(mergeButton && !mergeButton.disabled, 'Merge enabled for the branch')
  mergeButton?.click()
  await settle()
  check(document.querySelector('[role="dialog"]'), 'merge dialog open')
  check(s().branches.has(autumn), 'nothing merged yet')
}

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

/** Average (max - min channel) over sampled pixels: 0 for grey, higher for colorful. */
function meanChroma(source: HTMLCanvasElement, samples = 48): number {
  const c = document.createElement('canvas')
  c.width = c.height = samples
  const ctx = c.getContext('2d')!
  ctx.drawImage(source, 0, 0, samples, samples)
  const d = ctx.getImageData(0, 0, samples, samples).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 255
  return sum / (d.length / 4)
}

/** Distinct colors among a grid of samples from a canvas (ignores tiny regions). */
function colorsIn(source: HTMLCanvasElement, samples = 48): number {
  const c = document.createElement('canvas')
  c.width = samples
  c.height = samples
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, samples, samples)
  const d = ctx.getImageData(0, 0, samples, samples).data
  const seen = new Set<number>()
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
  return seen.size
}

async function saveShot(name: string, canvas: HTMLCanvasElement) {
  await fetch(`/__save?name=${name}`, { method: 'POST', body: canvas.toDataURL('image/png') }).catch(() => {})
}

async function openDemo(x: SelfTestExtras, settle: () => Promise<void>) {
  const bytes = new Uint8Array(await (await fetch('/fixtures/demo.pxmap')).arrayBuffer())
  x.open(bytes, 'demo.pxmap')
  await settle()
  await new Promise((r) => setTimeout(r, 1500)) // terrain + models
  await settle()
}

async function filtersTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  await openDemo(x, settle)
  // The grid is drawn over the filtered image on purpose (white, any palette); leave it out of
  // the palette color counts.
  x.settings.setOverride('grid', false)
  editor.rig.focus.set(-4, 0, 2)
  editor.rig.zoom = 48
  const counts: Record<string, number> = {}
  const chroma: Record<string, number> = {}
  for (const preset of PRESET_ORDER) {
    x.settings.chooseFilter(preset)
    await frame()
    await frame()
    // three.js attaches `diagnostics` to its program wrappers when a shader fails to compile.
    const programs = (editor.pixel.renderer.info.programs ?? []) as unknown as { diagnostics?: { runnable: boolean } }[]
    const bad = programs.filter((p) => p.diagnostics && !p.diagnostics.runnable)
    check(bad.length === 0, `${preset}: shaders compile`)
    counts[preset] = colorsIn(x.canvas)
    chroma[preset] = meanChroma(x.canvas)
    await saveShot(`filter-${preset.replace(' ', '-')}.png`, x.canvas)
  }
  check(counts.gameboy <= 4, `gameboy uses at most 4 colors (got ${counts.gameboy})`)
  check(counts.retro <= 16, `retro (PICO-8) uses at most 16 colors (got ${counts.retro})`)
  check(counts.clean > 24 && counts.pixel > 24, `clean / pixel keep full color (${counts.clean}, ${counts.pixel})`)
  check(chroma.sepia < chroma.pixel * 0.6, `sepia is far less colorful (${chroma.sepia.toFixed(3)} vs ${chroma.pixel.toFixed(3)})`)

  // Option override wins over the preset; choosing a preset clears overrides.
  x.settings.chooseFilter('pixel')
  x.settings.setOverride('pixel_size', 5)
  check(x.settings.get('pixel_size') === 5 && editor.pixel.pixelSize === 5, 'option override applies')
  x.settings.chooseFilter('gameboy')
  check(x.settings.get('pixel_size') === 4, 'choosing a preset resets option overrides')
  delete x.settings.overrides.grid
  x.settings.chooseFilter('pixel')
}

async function exportTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  await openDemo(x, settle)
  x.settings.chooseFilter('pixel')
  await frame()
  const filter = x.settings.filterOptions()

  const snap = x.exporter.snapshot(x.canvas, 2)
  check(snap.width === x.canvas.width * 2 && snap.height === x.canvas.height * 2, 'snapshot is 2x the canvas')

  const t0 = performance.now()
  const top = x.exporter.topDown(editor.session.doc, filter, 32, 3, false)!
  const ms = Math.round(performance.now() - t0)
  check(top && top.width % 3 === 0 && top.height % 3 === 0, `top-down sized in whole texels (${top?.width}x${top?.height})`)
  check(top && top.width > 1024, `top-down spans several tiles (${top?.width} px wide, ${ms} ms)`)
  check(top && colorsIn(top.canvas) > 12, 'top-down has content')
  if (top) await saveShot('export-top-down.png', top.canvas)

  const views = x.exporter.angles(editor.session.doc, filter, 1024, 3, false)
  check(views.length === 5, `5 angle views (got ${views.length})`)
  check(views.every((v) => Math.max(v.width, v.height) <= 1024 + 3 && v.width % 3 === 0 && colorsIn(v.canvas) > 12), 'angle views sized and non-empty')
  const ne = views.find((v) => v.name === 'iso-ne')
  if (ne) await saveShot('export-iso-ne.png', ne.canvas)

  // The screen keeps rendering normally afterwards.
  await frame()
  check(colorsIn(x.canvas) > 24, 'screen still renders after export')
}

/** Desktop build only: library over app://, the app's save/open against a real file, and Steam. */
async function desktopTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>,
  x: SelfTestExtras, report: Record<string, unknown>) {
  check(desktop, 'running in the desktop shell')
  if (!desktop?.test) return void check(false, 'test bridge available')
  report.platform = desktop.platform
  check(editor.library.props.size > 500, `library loaded over app:// (${editor.library.props.size} props)`)
  await openDemo(x, settle)
  const s = editor.session
  const count = () => [...editor.session.doc.objects.values()].filter((o) => !o.deleted).length

  // Save through the app (as the Save button does, with the path a dialog would have given).
  const file = await desktop.test.tempFile('desktop-test.pxmap')
  const prop = [...editor.library.props.values()][0]
  s.edit('Desktop test prop', () => s.createObject('prop', { prop: prop.id, position: new Vec3(3, 0, 3), rotation: 0 }))
  check(x.files.dirty(), 'edit marks the map dirty')
  x.files.setPath(file)
  await x.files.save()
  check(!x.files.dirty(), 'save clears dirty')
  check(x.files.name() === 'desktop-test.pxmap', `name follows the file (${x.files.name()})`)
  const objects = count()
  const txns = s.branch().txns.length

  // The bytes on disk are a valid project with the same content.
  const disk = await desktop.readFile(file)
  const fromDisk = openProject(disk.bytes)
  check([...fromDisk.doc.objects.values()].filter((o) => !o.deleted).length === objects, 'saved file has every object')
  check(fromDisk.branch().txns.length === txns, 'saved file has the full history')

  // Reopen through the app, edit, save again (to the same path, no dialog), reopen.
  x.open(saveProject(new MapSession()), 'blank')
  await x.files.openPath(file)
  await settle()
  check(editor.session.doc.objects.size > 0 && count() === objects, 'reopened map matches')
  check(x.files.path() === file, 'reopened map remembers its path')
  editor.session.undo()
  check(count() === objects - 1, 'undo after reopen removes the test prop')
  await x.files.save()
  const again = openProject((await desktop.readFile(file)).bytes)
  check([...again.doc.objects.values()].filter((o) => !o.deleted).length === objects - 1, 'second save wrote the undo')

  // Steam is optional: record what happened, but only fail on a malformed status.
  const st = await desktop.steam.status()
  report.steam = st
  check(typeof st.ok === 'boolean' && st.appId > 0, 'steam status shape')
  if (st.ok) check(st.name && st.steamId, 'steam user known')
  await saveShot('selftest-desktop.png', x.canvas)
}

/** Trackpad / mouse wheel handling through real (synthetic) wheel events on the canvas, plus the
 *  desktop rotate gesture through the main process. */
async function gesturesTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  // Classifier.
  const c = new WheelClassifier()
  const ev = (o: Partial<{ deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; wheelDeltaY: number; timeStamp: number }>) =>
    ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, timeStamp: 0, ...o })
  check(c.classify(ev({ deltaY: 4, wheelDeltaY: -12, timeStamp: 0 })) === 'pan', 'trackpad move pans')
  check(c.classify(ev({ deltaY: 40, wheelDeltaY: -120, timeStamp: 16 })) === 'pan', 'same stream stays a pan')
  check(c.classify(ev({ deltaY: -3, ctrlKey: true, timeStamp: 32 })) === 'pinch', 'ctrl+wheel is a pinch')
  check(c.classify(ev({ deltaY: 100, wheelDeltaY: -120, timeStamp: 1000 })) === 'zoom', 'mouse notch zooms')
  check(c.classify(ev({ deltaY: 3, deltaMode: 1, timeStamp: 2000 })) === 'zoom', 'line-mode wheel zooms')
  check(c.classify(ev({ deltaX: 5, deltaY: 1, timeStamp: 3000 })) === 'pan', 'sideways move pans')

  const { rig } = editor
  const s = editor.session
  rig.focus.set(0, 0, 0)
  rig.zoom = 40
  await settle()
  const canvas = x.canvas
  const r = canvas.getBoundingClientRect()
  const p = { x: r.width * 0.3, y: r.height * 0.4, shift: false, alt: false, cmd: false }
  const wheel = async (o: WheelEventInit) => {
    canvas.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true, ...o }))
    rig.update(0)
    await frame()
  }
  await sleep(400) // new stream

  // Two-finger move: the ground that was under p + delta is now under p; zoom unchanged.
  const target = editor.groundAt({ ...p, x: p.x + 60, y: p.y + 40 })!
  await wheel({ deltaX: 60, deltaY: 40 })
  const now = editor.groundAt(p)!
  check(rig.zoom === 40, `pan keeps zoom (${rig.zoom})`)
  check(now.distanceTo(target) < 0.5, `pan follows the fingers (${now.distanceTo(target).toFixed(2)} m off)`)

  // Pinch out: zoom in, the ground under the fingers stays put.
  await sleep(400)
  const under = editor.groundAt(p)!
  await wheel({ deltaY: -30, ctrlKey: true })
  check(rig.zoom < 40, `pinch out zooms in (${rig.zoom.toFixed(1)})`)
  check(editor.groundAt(p)!.distanceTo(under) < 0.5, 'pinch zooms around the fingers')

  // Rotate: turns around the view centre (focus stays), counter-clockwise fingers -> yaw down.
  if (desktop?.test) {
    // On a hill, so the ground at the centre is well above the focus plane.
    s.edit('Gesture hill', () => terrainEdit.heightOps(s.doc, new Rect2i(-10, -10, 20, 20), () => 6).forEach((op) => s.apply(op)))
    rig.focus.set(0, 0, 0)
    rig.update(0)
    await settle()
    const centre = { x: r.width / 2, y: r.height / 2, shift: false, alt: false, cmd: false }
    const pivot = editor.groundAt(centre)!
    const yaw = rig.yaw
    for (let i = 0; i < 6; i++) {
      desktop.test.rotate(15)
      await sleep(50)
    }
    await sleep(200)
    rig.update(0)
    const after = editor.groundAt(centre)!
    check(Math.abs(rig.yaw - (yaw - Math.PI / 2)) < 1e-6, `rotate gesture turns the view (${(((rig.yaw - yaw) * 180) / Math.PI).toFixed(1)}°)`)
    check(after.distanceTo(pivot) < 0.3, `rotation pivots on the ground at the view centre (${after.distanceTo(pivot).toFixed(2)} m drift)`)
  }
  // Panning over the hill keeps the focus on its plane.
  const y0 = rig.focus.y
  for (let i = 0; i < 5; i++) await wheel({ deltaX: 40, deltaY: -30 })
  check(Math.abs(rig.focus.y - y0) < 1e-9, 'panning over terrain keeps the focus height')
}

/** The tool registry: picking up with parameters, saved tools with and without number keys,
 *  matching the tool in hand, and the parameters a saved tool keeps. */
async function toolsTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  await settle()
  ui.tools = []
  check(pickUp(editor, 'sculpt', { op: 'smooth', radius: 8, strength: 0.25 }) && inHand(editor) === 'sculpt', 'pick up sculpt')
  const smooth = saveTool(editor, 2)
  check(smooth?.slot === 2 && describe(smooth, editor.library) === 'Smooth · 8 m · 25%', `saved on 2 (${smooth && describe(smooth, editor.library)})`)
  check(activeId(editor) === smooth?.id, 'the tool in hand matches its saved entry')
  setParams('sculpt', { radius: 16 })
  check(activeId(editor) === null, 'changing a kept parameter no longer matches')
  check(saveTool(editor)?.slot === null && ui.tools.length === 2, 'saving without a key')

  pickUp(editor, 'paint', { material: 3, radius: 2 })
  const rock = saveTool(editor, 2)
  check(rock && ui.tools.find((t) => t.id === smooth!.id)?.slot === null, 'a new tool on a used key takes the key')
  check(rock && !('strength' in rock.params), 'paint keeps no strength')

  const prop = [...editor.library.props.values()][0]
  pickUp(editor, 'place', { prop: prop.id, randomRotation: true })
  const placed = saveTool(editor)
  check(placed?.tool === 'place' && placed.params.prop === prop.id && placed.params.randomRotation === true, 'prop saved with its settings')

  pickUp(editor, 'build', { piece: 'door', level: 2 })
  const door = saveTool(editor, 5)
  check(door && !('level' in door.params), 'build level is not kept')

  putDown(editor)
  check(inHand(editor) === null, 'put down')
  check(useSaved(editor, smooth!.id) && inHand(editor) === 'sculpt' && toolParams.sculpt.op === 'smooth' && toolParams.sculpt.radius === 8, 'recall restores tool and parameters')
  check(useSaved(editor, placed!.id) && inHand(editor) === 'place' && toolParams.place.randomRotation === true, 'recall a prop')
  putDown(editor)
  ui.tools = []
}

/** Drawing water: closing on the first corner, the basin dug on flat ground (one undo step with
 *  the water), no digging when it's off, and liquids. */
async function waterTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  const { session: s, rig, pixel } = editor
  const doc = s.doc
  rig.focus.set(12, 0, 4)
  rig.zoom = 50
  rig.update(0)
  await settle()
  // Project from the ground's actual height, so clicks over a dug basin land where intended.
  const at = (px: number, pz: number): Pointer => {
    const p = pixel.toScreen(new THREE.Vector3(px, terrainEdit.heightAtWorld(doc, px, pz), pz), rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
  }
  /** Draws a square by clicking its corners, then the first corner again to close it. */
  const square = (x0: number, z0: number, size: number) => {
    pickUp(editor, 'water')
    const tool = editor.tool as WaterTool
    for (const [cx, cz] of [[x0, z0], [x0 + size, z0], [x0 + size, z0 + size], [x0, z0 + size], [x0, z0]]) {
      tool.pointerMove(at(cx, cz))
      tool.pointerDown(at(cx, cz))
    }
    const id = editor.selection.list()[0]
    return id ? doc.getObject(id) : undefined
  }
  const h = (sx: number, sz: number) => terrainEdit.heightAt(doc, sx, sz)

  // Indicators while drawing (screenshots only): three corners and the cursor away, then on the
  // first corner (closing). Esc drops the outline.
  {
    pickUp(editor, 'water')
    const tool = editor.tool as WaterTool
    for (const [cx, cz] of [[22, 0], [28, 0], [28, 6]]) {
      tool.pointerMove(at(cx, cz))
      tool.pointerDown(at(cx, cz))
    }
    tool.pointerMove(at(24, 7))
    await frame()
    await saveShot('selftest-water-drawing.png', x.canvas)
    tool.pointerMove(at(22.2, 0.2))
    await frame()
    await saveShot('selftest-water-closing.png', x.canvas)
    tool.key(new KeyboardEvent('keydown', { key: 'Escape' }))
    check(inHand(editor) === 'water', 'Esc drops the outline but keeps the tool')
    putDown(editor)
  }

  // Dig on (default): the surface stays at ground level, the ground inside goes down.
  setParams('water', { liquid: 'water', dig: true, depth: 1.5, shore: 3, snap: true })
  const txns = s.branch().txns.length
  const pond = square(0, 0, 8)
  check(pond?.type === 'water', 'closing on the first corner creates the water')
  check(inHand(editor) === null, 'the tool is put down afterwards')
  const level = (pond?.props.get('position') as Vec3 | undefined)?.y ?? NaN
  check(Math.abs(level) < 1e-6, `surface at the ground (${level})`)
  check(Math.abs(h(4, 4) - -1.5) < 0.01, `basin dug to the depth (${h(4, 4)})`)
  check(h(1, 4) < 0 && h(1, 4) > -1.5, `shore slopes down (${h(1, 4).toFixed(2)})`)
  check(h(-1, 4) === 0 && h(10, 4) === 0, 'ground outside untouched')
  check(s.branch().txns.length === txns + 1 && s.branch().txns.at(-1)?.label === 'Draw water', 'one edit: "Draw water"')
  s.undo()
  check(!doc.getObject(pond!.id) || doc.getObject(pond!.id)!.deleted, 'undo removes the water')
  check(h(4, 4) === 0, 'and the basin')
  s.redo()

  // Dig off: the ground stays flat.
  setParams('water', { dig: false })
  square(12, 0, 6)
  check(h(15, 3) === 0, 'no basin when digging is off')

  // Another liquid; digging into an existing hollow doesn't go deeper.
  setParams('water', { liquid: 'lava', dig: true, depth: 2 })
  const lava = square(1, 1, 6)
  check(lava?.props.get('liquid') === 'lava', 'lava keeps its liquid')
  check(s.branch().txns.at(-1)?.label === 'Draw lava', 'history says "Draw lava"')
  check(Math.abs(h(4, 4) - -1.5) < 0.01, `an existing hollow is filled, not dug deeper (${h(4, 4)})`)
  await settle()
  check(editor.world.highlightRoot.children.length === 1, 'lava rendered and highlighted')
  await saveShot('selftest-water.png', x.canvas)

  // One basin of every liquid in a row, unselected, for a look at each.
  rig.focus.set(20, 0, 34)
  rig.zoom = 34
  rig.update(0)
  await settle()
  LIQUIDS.forEach((l, i) => {
    setParams('water', { liquid: l.id, dig: true, depth: 1.5 })
    square(i * 7 - 8, 30, 5)
  })
  editor.selection.clear()
  await settle()
  await new Promise((r) => setTimeout(r, 600))
  check(LIQUIDS.every((l) => [...doc.objects.values()].some((o) => !o.deleted && o.props.get('liquid') === l.id)), 'every liquid drawn')
  await saveShot('selftest-water-liquids.png', x.canvas)
  setParams('water', { liquid: 'water', dig: true, depth: 1.5 })
}
