// End-to-end self-tests that drive the real editor code in the browser (the web counterpart of
// tests/smoke_editor.gd). Run with ?selftest=place; results go to web/app/shots/selftest-<name>.json
// (dev server) and the page title becomes "SELFTEST PASS" / "SELFTEST FAIL".

import * as THREE from 'three'
import { APARTMENT, BuildingLayout, generateBuilding, HOUSE, MAIN, MapSession, merge, openProject, Rect2i, saveProject, terrainBrush, terrainEdit, Vec2i, Vec3 } from '@pixel-arena/core'
import { PALETTE } from '../render/terrain-shading'
import { PaintPolygonTool } from './paint-polygon-tool'
import { placeGenerated } from './generated'
import { loadModel } from '../library/models'
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
import * as grouping from './grouping'
import { WaterBrushTool } from './water-brush'
import { addWater, containsPoint, eraseWater, lastWaterAdded, overlapArea, shapeArea, strokeShape, worldShape } from './water-shapes'
import { outline } from '../ui/objects'

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
    else if (name === 'camera') await cameraTest(editor, check, settle, extras)
    else if (name === 'panels') await panelsTest(editor, check, settle, extras)
    else if (name === 'materials') await materialsTest(editor, check, settle, extras)
    else if (name === 'liquids') await liquidsTest(editor, check, settle, extras)
    else if (name === 'library') await libraryTest(editor, check, report)
    else if (name === 'kits') await kitsTest(editor, check, settle, report)
    else if (name === 'generator') await generatorTest(editor, check, settle, report)
    else if (name === 'facing') await facingTest(editor, check, settle)
    else if (name === 'tools') await toolsTest(editor, check, settle)
    else if (name === 'outliner') await outlinerTest(editor, check, settle, extras)
    else if (name === 'water') await waterTest(editor, check, settle, extras)
    else if (name === 'waterrules') await waterRulesTest(editor, check, settle)
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

  // Choosing another prop while one is in hand places the new one (the tool is remade).
  pickUp(editor, 'place', { prop: 'kenney_nature:rock_large_a' })
  pickUp(editor, 'place', { prop: 'kenney_nature:pot_large' })
  check(editor.tool instanceof PlaceTool && (editor.tool as PlaceTool).prop.id === 'kenney_nature:pot_large', `the second prop is in hand (${(editor.tool as PlaceTool).prop?.id})`)
  const before = props().length
  const far = at(new THREE.Vector3(6, 0, 6))
  editor.tool.pointerMove?.(far)
  editor.tool.pointerDown?.(far)
  check(props().length === before + 1 && props().at(-1)?.props.get('prop') === 'kenney_nature:pot_large', `the chosen prop is placed (${props().at(-1)?.props.get('prop')})`)
  s.undo()
  editor.setTool(place)

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
  check(editor.marks.root.children.length === 1, 'selected object is marked')

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

  // Water: three corners + Enter -> created, the tool stays in hand; selected, PageUp raises it.
  const water = new WaterTool(editor)
  editor.setTool(water)
  for (const c of [new THREE.Vector3(-8, 0, -4), new THREE.Vector3(-2, 0, -4), new THREE.Vector3(-5, 0, 1)]) {
    const p = ptr(c)
    water.pointerMove(p)
    water.pointerDown(p)
  }
  water.key(new KeyboardEvent('keydown', { key: 'Enter' }))
  const ids = lastWaterAdded.ids
  const obj = ids.length === 1 ? doc.getObject(ids[0]) : undefined
  check(obj?.type === 'water', 'water created')
  check(editor.tool === water, 'the water tool stays in hand')
  editor.setTool(editor.defaultTool())
  editor.selection.set(ids)
  const y0 = (obj?.props.get('position') as Vec3 | undefined)?.y ?? NaN
  editor.tool.key?.(new KeyboardEvent('keydown', { key: 'PageUp' }))
  check(Math.abs((doc.getProp(ids[0], 'position') as Vec3).y - y0 - 0.25) < 1e-9, 'PageUp raises the water by 0.25 m')
  await settle()
  check(world.objectRoot(ids[0]) && editor.marks.root.children.length === 1, 'water rendered and marked')
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

  // The interior kit (2 m cells): a 3 x 2 room, an interior wall with a doorway, and stairs.
  setParams('build', { kit: 'kenney_building_kit:interior', piece: 'foundation' })
  editor.selection.clear()
  tool.target = ''
  tool.setLevel(0)
  const o2 = new THREE.Vector3(16, 0, -16)
  // A rectangle drag: out to 4 x 3 cells, back to 3 x 2 (the extra cells go back), released.
  const steps0 = s.history(s.currentBranch).length
  tool.pointerDown(at(o2.clone().add(new THREE.Vector3(1, 0, 1))))
  tool.pointerMove(at(o2.clone().add(new THREE.Vector3(7, 0, 5))))
  tool.pointerMove(at(o2.clone().add(new THREE.Vector3(5, 0, 3))))
  tool.pointerUp()
  check(s.history(s.currentBranch).length === steps0 + 1, 'the rectangle drag is one undo step')
  const room = tool.target
  check(room && doc.getProp(room, 'kit') === 'kenney_building_kit:interior', 'interior kit building')
  check(BuildingLayout.fromObject(doc.getObject(room)!).cells(0).size === 6, `6 cells (${BuildingLayout.fromObject(doc.getObject(room)!).cells(0).size})`)
  const rpos = doc.getProp(room, 'position') as Vec3
  const r = (x: number, z: number) => at(new THREE.Vector3(rpos.x + x, rpos.y, rpos.z + z))
  // Interior walls on x = 4 (between columns 1 and 2), then a doorway in the second.
  setParams('build', { piece: 'wall' })
  tool.pointerDown(r(4, 1))
  tool.pointerDown(r(4, 3))
  setParams('build', { piece: 'doorway' })
  tool.pointerDown(r(4, 3))
  let rl = BuildingLayout.fromObject(doc.getObject(room)!)
  check(rl.effectiveKind(0, '2,0,W') === 'wall' && rl.effectiveKind(0, '2,1,W') === 'doorway', `interior wall and doorway (${rl.effectiveKind(0, '2,0,W')}, ${rl.effectiveKind(0, '2,1,W')})`)
  // Stairs in cell (0, 1) rising north (cursor near its north side); again from the east turns
  // them; again from the east removes them.
  setParams('build', { piece: 'stairs' })
  tool.pointerDown(r(1, 2.3))
  rl = BuildingLayout.fromObject(doc.getObject(room)!)
  check(rl.stairs(0).get('0,1')?.dir === 'N', `stairs rising north (${rl.stairs(0).get('0,1')?.dir})`)
  tool.pointerDown(r(1.7, 3))
  check(BuildingLayout.fromObject(doc.getObject(room)!).stairs(0).get('0,1')?.dir === 'E', 'clicking near another side turns them')
  tool.pointerDown(r(1.7, 3))
  check(BuildingLayout.fromObject(doc.getObject(room)!).stairs(0).size === 0, 'clicking the same way again removes them')
  s.undo()
  check(BuildingLayout.fromObject(doc.getObject(room)!).stairs(0).get('0,1')?.dir === 'E', 'undo puts them back')

  // A new building painted away from the current one uses the kit chosen in the catalogue.
  setParams('build', { kit: 'kenney_retro_urban:brick', piece: 'foundation' })
  tool.setLevel(0)
  const away = at(new THREE.Vector3(rpos.x + 20, 0, rpos.z + 20))
  tool.pointerDown(away)
  tool.pointerUp()
  check(tool.target !== room && doc.getProp(tool.target, 'kit') === 'kenney_retro_urban:brick', `new building uses the chosen kit (${doc.getProp(tool.target, 'kit')})`)
  s.undo()
  tool.target = room
  setParams('build', { kit: 'kenney_building_kit:interior' })

  // Rooms: drag the Room piece over the left column -> kitchen; the rest stays without a room.
  setParams('build', { piece: 'room', room: 'kitchen' })
  tool.pointerDown(r(1, 1))
  tool.pointerMove(r(1, 3))
  tool.pointerUp()
  rl = BuildingLayout.fromObject(doc.getObject(room)!)
  check(rl.rooms(0).get('0,0') === 'kitchen' && rl.rooms(0).get('0,1') === 'kitchen' && !rl.rooms(0).has('2,0'), `kitchen painted (${[...rl.rooms(0)].join(' ')})`)

  // Furnishing: with the view cut to level 0, a chair placed in the room stands on its floor
  // and belongs to the building; it moves with it.
  editor.setTool(editor.defaultTool())
  // View -> Levels: up to level 0 (as a user would).
  const setLevels = async (v: number) => {
    document.querySelector<HTMLButtonElement>('button[aria-label="View settings"]')?.click()
    await settle()
    const sel = [...document.querySelectorAll<HTMLSelectElement>('.popover select')].find((x) => [...x.options].some((o) => o.text === 'All levels'))
    if (sel) {
      sel.value = String(v)
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }
    document.querySelector<HTMLButtonElement>('button[aria-label="View settings"]')?.click()
    await settle()
  }
  await setLevels(0)
  check(world.cutawayLevel === 0, `View -> Levels cuts the view (${world.cutawayLevel})`)
  const chairProp = editor.library.props.get('kenney_furniture:chair')!
  editor.setTool(new PlaceTool(editor, chairProp))
  const spot = r(5, 3)
  editor.tool.pointerMove?.(spot)
  editor.tool.pointerDown?.(spot)
  const chair = [...doc.objects.values()].find((o) => !o.deleted && o.props.get('prop') === chairProp.id)
  check(chair?.props.get('parent') === room, `chair belongs to the building (${chair?.props.get('parent')})`)
  check(Math.abs(((chair?.props.get('position') as Vec3)?.y ?? -9) - rpos.y) < 0.3, `chair on the floor (y ${(chair?.props.get('position') as Vec3)?.y?.toFixed(2)})`)
  editor.setTool(editor.defaultTool())
  editor.selection.set([room])
  const chairX = (doc.getProp(chair!.id, 'position') as Vec3).x
  ;(editor.tool as SelectTool).translateSelection(new Vec3(2, 0, 0))
  check(Math.abs((doc.getProp(chair!.id, 'position') as Vec3).x - chairX - 2) < 1e-6, 'chair moved with the building')
  s.undo()
  await setLevels(-1)

  // A second storey with a bed; cut to level 0, the bed is hidden and the front walls are low.
  setParams('build', { piece: 'foundation' })
  editor.setTool(tool)
  tool.target = room
  tool.setLevel(1)
  tool.pointerMove(r(1, 1))
  const guide = (tool as unknown as { guide: THREE.Group }).guide
  check(guide.children.length === 2, `a wireframe down to the ground on level 1 (${guide.children.length} lines)`)
  rig.focus.set(rpos.x + 3, 1, rpos.z + 2)
  rig.zoom = 16
  rig.update(0)
  tool.pointerMove(r(1, 1))
  await settle()
  await frame()
  await fetch('/__save?name=selftest-building-guide.png', { method: 'POST', body: pixel.canvas.toDataURL('image/png') }).catch(() => {})
  tool.pointerDown(r(1, 1))
  tool.pointerMove(r(3, 1))
  tool.pointerUp()
  const bed = s.createObject.bind(s)
  let bedId = ''
  s.edit('Bed', () => (bedId = bed('prop', { prop: 'kenney_furniture:bed_double', position: new Vec3(rpos.x + 2, rpos.y + 2.4, rpos.z + 1), rotation: 0, parent: room })))
  tool.setLevel(0)
  await settle()
  check(!world.objectRoot(bedId) && ![...(world as unknown as { slots: Map<string, unknown> }).slots.keys()].includes(bedId), 'upper-floor furniture hidden when cut to level 0')
  tool.setLevel(1)
  await settle()
  check([...(world as unknown as { slots: Map<string, unknown> }).slots.keys()].includes(bedId), 'shown again on its level')
  tool.setLevel(0)
  world.update(0, rig.camera)
  const ground = world.objectRoot(room)?.children.find((c) => c.userData.level === 0)
  const walls = ground?.children.filter((c) => c.userData.wall) ?? []
  const low = walls.filter((w) => w.scale.y < 0.5)
  check(walls.length > 0 && low.length > 0 && low.length < walls.length, `front and interior walls cut low (${low.length} of ${walls.length})`)
  check(low.every((w) => w.userData.wall.interior || w.userData.wall.side === 'S' || w.userData.wall.side === 'E' || w.userData.wall.side === 'N' || w.userData.wall.side === 'W'), 'cut walls are tagged')
  // Hovering a cut-down outside wall with the Door piece stands it up, so the edit shows.
  const front = low.find((w) => !w.userData.wall.interior)!
  const [fx, fz, fside] = String(front.userData.wall.edge).split(',')
  const mid = fside === 'W' ? [Number(fx) * 2, (Number(fz) + 0.5) * 2] : [(Number(fx) + 0.5) * 2, Number(fz) * 2]
  setParams('build', { piece: 'door' })
  tool.pointerMove(r(mid[0], mid[1]))
  world.update(0, rig.camera)
  check(front.scale.y === 1, `the hovered wall stands full height (${front.scale.y})`)
  check(walls.filter((w) => w !== front && w.scale.y < 0.5).length === low.length - 1, 'the other cut walls stay low')
  // A few more furnishings for the shot: a bed and table in the main room.
  s.edit('Furnish', () => {
    s.createObject('prop', { prop: 'kenney_furniture:table', position: new Vec3(rpos.x + 3.6, rpos.y + 0.1, rpos.z + 1.2), rotation: 0, parent: room })
    s.createObject('prop', { prop: 'kenney_furniture:kitchen_fridge', position: new Vec3(rpos.x + 0.6, rpos.y + 0.1, rpos.z + 0.5), rotation: 0, parent: room })
    s.createObject('prop', { prop: 'kenney_furniture:lounge_sofa', position: new Vec3(rpos.x + 5, rpos.y + 0.1, rpos.z + 1), rotation: -Math.PI / 2, parent: room })
  })
  editor.selection.clear()
  setParams('build', { piece: 'wall' })
  tool.pointerMove({ x: -100, y: -100, shift: false, alt: false, cmd: false })
  rig.focus.set(rpos.x + 3, 0, rpos.z + 2)
  rig.zoom = 14
  rig.update(0)
  await settle()
  await sleep(500)
  await frame()
  await fetch('/__save?name=selftest-building-interior.png', { method: 'POST', body: pixel.canvas.toDataURL('image/png') }).catch(() => {})

  // Leaving the tool restores the view's cutaway setting.
  editor.setTool(editor.defaultTool())
  check(world.cutawayLevel === editor.viewCutaway, 'cutaway restored on leaving the tool')
  setParams('build', { kit: 'kenney_town:timber' })
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

  // The History dialog lists both branches; undoing the merge works from main.
  ;(document.querySelector('button[aria-label="History"]') as HTMLButtonElement | null)?.click()
  await settle()
  const items = document.querySelectorAll('.history .branches li')
  check(items.length === 2, `panel lists 2 branches (got ${items.length})`)
  // "From history" inherits main's first two entries (Place stump, Paint blue) and has none of its own.
  const entries = document.querySelectorAll('.history .list li')
  check(entries.length === 2, `panel lists the branch's history (got ${entries.length})`)
  ;(document.querySelector('button[aria-label="History"]') as HTMLButtonElement | null)?.click()
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
  ;(document.querySelector('button[aria-label="History"]') as HTMLButtonElement | null)?.click()
  await settle()
  const rows = [...document.querySelectorAll<HTMLElement>('.history .branches li .list-row')]
  const row = rows.find((b) => b.textContent?.includes('Autumn version'))
  check(row, 'branch row shown')
  row?.querySelector<HTMLButtonElement>('button.more')?.click()
  await settle()
  const mergeButton = [...document.querySelectorAll<HTMLButtonElement>('.menu-list button')].find((b) => b.textContent?.startsWith('Merge'))
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
/** Furniture at rotation 0 in a row, seen from the south (camera at +z): shows which way each
 *  model faces (selftest-facing.png; a model facing +z shows its front). */
async function facingTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  const ids = ['chair', 'bed_double', 'lounge_sofa', 'toilet', 'bathroom_sink', 'kitchen_stove', 'kitchen_fridge', 'desk', 'chair_desk',
    'cabinet_television', 'television_modern', 'bookcase_closed', 'bathtub', 'shower', 'lounge_chair', 'kitchen_sink', 'washer', 'side_table_drawers', 'coat_rack_standing']
  const s = editor.session
  let x = -20
  s.edit('Facing', () => {
    for (const id of ids) {
      const p = editor.library.props.get(`kenney_furniture:${id}`)
      check(p, id)
      if (!p) continue
      x += p.footprint[0] / 2 + 0.4
      s.createObject('prop', { prop: p.id, position: new Vec3(x, 0, 0), rotation: 0 })
      x += p.footprint[0] / 2
    }
  })
  await settle()
  await sleep(2000)
  const rig = editor.rig
  rig.rotateBy(-rig.yaw)
  rig.update(1)
  for (const [i, fx] of [[1, -12], [2, 0]] as const) {
    rig.focus.set(fx, 0, 0)
    rig.zoom = 9
    rig.update(0)
    await sleep(500)
    await frame()
    await fetch(`/__save?name=selftest-facing${i}.png`, { method: 'POST', body: editor.pixel.canvas.toDataURL('image/png') }).catch(() => {})
  }
}

/** Generated buildings on the map: three houses and three apartment blocks, from fixed seeds, in
 *  a row (selftest-generator*.png); each is a valid building of its kit. */
async function generatorTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, report: Record<string, unknown>) {
  const s = editor.session
  let x = -40
  const made: { id: string; at: Vec3; size: number }[] = []
  s.edit('Generated buildings', () => {
    for (const [recipe, seeds] of [[HOUSE, [1, 2, 3]], [APARTMENT, [4, 5, 6]]] as const) {
      for (const seed of seeds) {
        const g = generateBuilding(recipe, seed)
        const cs = editor.library.kits.get(recipe.kit)?.cellSize ?? 2
        const at = new Vec3(x, 0, 0)
        const id = placeGenerated(s, g, at)
        made.push({ id, at, size: Math.max(g.summary.width, g.summary.depth) * cs })
        x += g.summary.width * cs + (recipe.yard ? 14 : 4)
      }
    }
  })
  check(made.length === 6, 'six generated buildings')
  const kids = [...s.doc.objects.values()].filter((o) => !o.deleted && made.some((m) => m.id === o.props.get('parent')))
  check(kids.length > 60, `furniture and yards as the buildings' children (${kids.length})`)
  check(kids.every((k) => editor.library.props.has(String(k.props.get('prop')))), 'every furnishing is a known prop')
  await settle()
  await sleep(2500)
  const rig = editor.rig
  const shot = async (name: string) => {
    rig.update(0)
    await sleep(600)
    await frame()
    await fetch(`/__save?name=selftest-generator-${name}.png`, { method: 'POST', body: editor.pixel.canvas.toDataURL('image/png') }).catch(() => {})
  }
  rig.focus.set(x / 2 - 20, 0, 6)
  rig.zoom = 60
  await shot('row')
  // A house and an apartment cut to the ground floor (the dollhouse view).
  for (const [i, m] of [[0, made[0]], [1, made[3]]] as const) {
    rig.focus.set(m.at.x + m.size / 2, 0, m.at.z + m.size / 2)
    rig.zoom = m.size * 1.8
    editor.world.setCutaway(0)
    await shot(`inside-${i}`)
    editor.world.setCutaway(1)
    await shot(`inside-${i}-upper`)
  }
  // Cut to level 1, the house's upper interior walls stand on level 1 (not squashed into level 0).
  editor.world.setCutaway(1)
  editor.world.update(0, rig.camera)
  const up = editor.world.objectRoot(made[0].id)?.children.find((c) => c.userData.level === 1)
  const inner = up?.children.filter((c) => c.userData.wall?.interior) ?? []
  const box = new THREE.Box3()
  for (const w of inner) box.expandByObject(w)
  check(inner.length > 0 && box.min.y >= made[0].at.y + 2.3, `upper interior walls on their floor (${inner.length}, bottom ${box.min.y.toFixed(2)})`)
  editor.world.setCutaway(-1)
  report.generated = made.length
}

/** One sample building per kit, side by side: an L-shaped two-storey plan with a door and
 *  windows on the street side (south), an interior wall with a doorway, and stairs. Shots of
 *  the row and of each kit's building (selftest-kits-*.png); checks every kit's pieces load. */
async function kitsTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, report: Record<string, unknown>) {
  const s = editor.session
  const lib = editor.library
  const kits = [...lib.kits.values()]
  for (const k of kits) for (const [role, ids] of Object.entries(k.pieces)) for (const id of ids ?? []) check(lib.props.has(id), `${k.id} ${role}: ${id} exists`)
  let x = -40
  const placed: { kit: string; id: string; at: Vec3; width: number }[] = []
  s.edit('Kit samples', () => {
    for (const k of kits) {
      const cs = k.cellSize
      const at = new Vec3(Math.round(x / cs) * cs, 0, 0)
      const id = s.createObject('building', { kit: k.id, position: at, rotation: 0, 'roof/style': 'gable' })
      // Ground floor 4 x 3 cells with a 2 x 2 wing; upper floor over the 4 x 3 part.
      const cells: [number, number, number][] = []
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cells.push([0, i, j], [1, i, j])
      for (let i = 0; i < 2; i++) for (let j = 3; j < 5; j++) cells.push([0, i, j])
      for (const [l, i, j] of cells) s.setProp(id, BuildingLayout.cellPath(l, new Vec2i(i, j)), true)
      s.setProp(id, BuildingLayout.wallPath(0, '1,5,N'), 'door')
      s.setProp(id, BuildingLayout.wallPath(0, '4,1,W'), 'window')
      s.setProp(id, BuildingLayout.wallPath(0, '3,3,N'), 'window')
      s.setProp(id, BuildingLayout.wallPath(1, '1,3,N'), 'window')
      s.setProp(id, BuildingLayout.wallPath(0, '2,0,W'), 'wall')
      s.setProp(id, BuildingLayout.wallPath(0, '2,1,W'), 'doorway')
      s.setProp(id, BuildingLayout.wallPath(0, '2,2,W'), 'wall')
      s.setProp(id, BuildingLayout.stairsPath(0, new Vec2i(3, 2)), 'N')
      placed.push({ kit: k.id, id, at, width: 4 * cs })
      x += 4 * cs + 6
    }
  })
  await settle()
  await sleep(3000)
  const rig = editor.rig
  const shot = async (name: string) => {
    rig.update(0)
    await sleep(600)
    await frame()
    await fetch(`/__save?name=selftest-kits-${name}.png`, { method: 'POST', body: editor.pixel.canvas.toDataURL('image/png') }).catch(() => {})
  }
  rig.focus.set(x / 2 - 20, 0, 4)
  rig.zoom = 70
  await shot('row')
  // Interior from the other side (doorway and stairs face away from the default view).
  const inner = placed.find((p) => p.kit.endsWith(':interior'))
  if (inner) {
    rig.focus.set(inner.at.x + inner.width / 2, 1, inner.at.z + inner.width / 2)
    rig.zoom = inner.width * 1.6
    rig.rotateBy(Math.PI)
    rig.update(1)
    editor.world.setCutaway(0)
    await shot('interior-back')
    rig.rotateBy(-Math.PI)
    rig.update(1)
  }
  for (const p of placed) {
    rig.focus.set(p.at.x + p.width / 2, 2, p.at.z + p.width / 2)
    rig.zoom = p.width * 2.4
    editor.world.setCutaway(-1)
    await shot(p.kit.replace(':', '-'))
    editor.world.setCutaway(0)
    await shot(`${p.kit.replace(':', '-')}-ground`)
  }
  editor.world.setCutaway(-1)
  report.kits = kits.map((k) => k.id)
}

/** Every prop loads, sits on the ground and is centered on its footprint (import-packs.mjs
 *  re-centers third-party models), with the size its manifest says. Reports per-pack counts. */
async function libraryTest(editor: Editor, check: (ok: unknown, what: string) => void, report: Record<string, unknown>) {
  const lib = editor.library
  check(lib.errors.length === 0, `library loads without errors (${lib.errors.slice(0, 5).join('; ')})`)
  const perPack: Record<string, number> = {}
  const bad: string[] = []
  const props = [...lib.props.values()]
  for (let i = 0; i < props.length; i += 24) {
    await Promise.all(props.slice(i, i + 24).map(async (p) => {
      perPack[p.packId] = (perPack[p.packId] ?? 0) + 1
      // The packs made by the Godot importer place some models by their own pivot; check ours.
      if (['kenney_town', 'kenney_nature', 'kenney_characters'].includes(p.packId)) return
      try {
        const m = await loadModel(p)
        const size = m.box.getSize(new THREE.Vector3())
        const c = m.box.getCenter(new THREE.Vector3())
        const tol = Math.max(0.03, Math.max(size.x, size.z) * 0.02)
        if (Math.abs(c.x) > tol || Math.abs(c.z) > tol || Math.abs(m.box.min.y) > 0.03) bad.push(`${p.id} off center (${c.x.toFixed(2)}, ${m.box.min.y.toFixed(2)}, ${c.z.toFixed(2)})`)
        else if (Math.abs(size.x - p.footprint[0]) > 0.05 || Math.abs(size.z - p.footprint[1]) > 0.05 || Math.abs(size.y - p.height) > 0.05) bad.push(`${p.id} size ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} vs ${p.footprint.join('x')}h${p.height}`)
      } catch (e) {
        bad.push(`${p.id} failed: ${String(e).slice(0, 80)}`)
      }
    }))
  }
  check(bad.length === 0, `${bad.length} props wrong: ${bad.slice(0, 8).join('; ')}`)
  report.props = props.length
  report.perPack = perPack

  // A scale lineup on the map: a person beside furniture, doors, cars and buildings from every
  // pack (selftest-library-lineup*.png).
  const LINEUP = [
    'kenney_characters:character_female_a', 'kenney_building_kit:wall', 'kenney_building_kit:door_rotate_square_a',
    'kenney_furniture:chair', 'kenney_furniture:bed_double', 'kenney_furniture:kitchen_fridge',
    'kaykit_furniture:bed_double_a', 'kaykit_restaurant:chair_a', 'quaternius_interior:bed_king', 'quaternius_interior:kitchen_fridge',
    'styloo_school:classroom_desk', 'styloo_school:classroom_locker', 'kenney_cars:sedan', 'kenney_cars:police',
    'kenney_town:wall_door', 'kenney_retro_urban:wall_a_door', 'kenney_modular_buildings:building_door',
    'kenney_suburban:building_type_a', 'kaykit_city:building_a', 'kenney_commercial:building_a',
  ]
  const s = editor.session
  let x = -30
  const ids: string[] = []
  s.edit('Lineup', () => {
    for (const id of LINEUP) {
      const p = lib.props.get(id)
      check(p, `lineup prop ${id} exists`)
      if (!p) continue
      x += p.footprint[0] / 2 + 0.6
      ids.push(s.createObject('prop', { prop: id, position: new Vec3(x, 0, 0), rotation: 0 }))
      x += p.footprint[0] / 2
    }
  })
  await sleep(4000)
  const rig = editor.rig
  for (const [i, [fx, zoom]] of [[-18, 16], [-4, 18], [10, 40]].entries()) {
    rig.focus.set(fx, 0, 0)
    rig.zoom = zoom
    rig.update(0)
    await sleep(800)
    await frame()
    await fetch(`/__save?name=selftest-library-lineup${i + 1}.png`, { method: 'POST', body: editor.pixel.canvas.toDataURL('image/png') }).catch(() => {})
  }
}

/** Every liquid side by side (an 8 m pond each, dug 1.5 m, in two rows), shot at noon and at
 *  night: selftest-liquids-noon.png / -night.png. Checks each pond renders. */
async function liquidsTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  const { rig } = editor
  const s = editor.session
  LIQUIDS.forEach((l, i) => {
    const x0 = -20 + (i % 4) * 10
    const z0 = -10 + Math.floor(i / 4) * 10
    s.edit(`Pond ${l.id}`, () => addWater(s, [[[[x0, z0], [x0 + 8, z0], [x0 + 8, z0 + 8], [x0, z0 + 8]]]], { liquid: l.id, dig: true, depth: 1.5, shore: 2, start: [x0, z0] }))
  })
  const ponds = [...s.doc.objects.values()].filter((o) => !o.deleted && o.type === 'water')
  check(ponds.length === LIQUIDS.length, `one pond per liquid (${ponds.length})`)
  rig.focus.set(0, 0, 0)
  rig.zoom = 34
  rig.update(0)
  for (const [time, name] of [[12, 'noon'], [22, 'night'], [17.6, 'dusk']] as const) {
    x.settings.setOverride('time_of_day', time)
    await settle()
    await sleep(600) // let the surfaces animate a little
    await frame()
    await fetch(`/__save?name=selftest-liquids-${name}.png`, { method: 'POST', body: x.canvas.toDataURL('image/png') }).catch(() => {})
  }
  x.settings.clearOverride('time_of_day')

  // Flow: the surface moves with the current, in the body's frame; the Selection rows set it.
  const pond = ponds.find((o) => o.props.get('liquid') === 'water')!
  const flowOf = () => {
    let v: THREE.Vector2 | null = null
    ;(editor.world as unknown as { singles: Map<string, { root: THREE.Object3D }> }).singles.get(pond.id)?.root.traverse((o) => {
      if (o.userData.flowVel) v = o.userData.flowVel
    })
    return v as THREE.Vector2 | null
  }
  s.edit('Flow', () => {
    s.setProp(pond.id, 'flow_speed', 1.5)
    s.setProp(pond.id, 'flow_dir', 0)
  })
  await settle()
  const v = flowOf()
  check(v && Math.abs(v.length() - 1.5) < 1e-6, `flowing at 1.5 m/s (${v?.length()})`)
  editor.selection.set([pond.id])
  await settle()
  const dial = document.querySelector<SVGSVGElement>('.selection-box svg[aria-label="Flow direction"]')
  check(dial, 'direction dial shown while flowing')
  if (dial) {
    // Click the dial's right edge: toward screen right, whichever way the view is turned.
    const r = dial.getBoundingClientRect()
    const at = { clientX: r.right - 2, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1 }
    dial.dispatchEvent(new PointerEvent('pointerdown', at))
    dial.dispatchEvent(new PointerEvent('pointerup', at))
  }
  await settle()
  const w = flowOf()
  // Screen right on the ground, for the view's yaw.
  const sr = new THREE.Vector2(Math.cos(rig.yaw), -Math.sin(rig.yaw))
  check(w && w.clone().normalize().dot(sr) > 0.96, `the dial's right edge flows toward screen right (${w?.x.toFixed(2)}, ${w?.y.toFixed(2)})`)
  // Facing: the dial sets the rotation (0 faces south, 180).
  const facing = document.querySelector<HTMLInputElement>('.selection-box input[aria-label="Facing in degrees"]')
  check(facing?.value === '180', `rotation 0 faces south (${facing?.value})`)
  if (facing) {
    facing.value = '90'
    facing.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await settle()
  const yaw = Number(s.doc.getProp(pond.id, 'rotation') ?? 0)
  check(Math.abs(((yaw * 180) / Math.PI + 360) % 360 - 90) < 0.5, `facing east turns the body to 90° (${((yaw * 180) / Math.PI).toFixed(1)})`)
  // Flow is kept in the body's frame, so turning the body by 90° turns the current with it.
  check(Math.abs(flowOf()!.clone().normalize().dot(w!.clone().normalize())) < 0.05, 'flow turns with the body')

  // Dragging the Facing dial turns the body while dragging; release makes one undo step.
  const facingDial = document.querySelector<SVGSVGElement>('.selection-box svg[aria-label="Facing"]')
  if (facingDial) {
    const r = facingDial.getBoundingClientRect()
    const at = (x: number, y: number) => ({ clientX: x, clientY: y, bubbles: true, pointerId: 1 })
    const yaw0 = Number(s.doc.getProp(pond.id, 'rotation') ?? 0)
    const steps = s.history(s.currentBranch).length
    facingDial.dispatchEvent(new PointerEvent('pointerdown', at(r.left + r.width / 2, r.top + 2)))
    await sleep(120)
    const yaw1 = Number(s.doc.getProp(pond.id, 'rotation') ?? 0)
    facingDial.dispatchEvent(new PointerEvent('pointermove', at(r.left + 2, r.top + r.height / 2)))
    await sleep(120)
    const yaw2 = Number(s.doc.getProp(pond.id, 'rotation') ?? 0)
    check(Math.abs(yaw1 - yaw0) > 0.01 && Math.abs(yaw2 - yaw1) > 0.01, `the body turns while dragging (${yaw0.toFixed(2)} → ${yaw1.toFixed(2)} → ${yaw2.toFixed(2)})`)
    check(s.history(s.currentBranch).length === steps, 'no undo steps while dragging')
    facingDial.dispatchEvent(new PointerEvent('pointerup', at(r.left + 2, r.top + r.height / 2)))
    await settle()
    check(s.history(s.currentBranch).length === steps + 1, `one undo step on release (${s.history(s.currentBranch).length - steps})`)
    s.undo()
    check(Math.abs(Number(s.doc.getProp(pond.id, 'rotation') ?? 0) - yaw0) < 1e-6, 'undo puts it back')
  }
  await desktop?.test?.capture('liquids-flow.png')
}

/** Terrain materials: every slot of the texture pack loads with its texture; the paint tool's
 *  polygon shape fills the cells inside the clicked outline (one undo step) and stays in hand.
 *  Leaves a swatch of every material by the camera (selftest-materials.png). */
async function materialsTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  const { rig } = editor
  const s = editor.session
  check(PALETTE.length >= 26 && PALETTE.slice(0, 26).every((m) => m.texture), `26 textured materials (${PALETTE.filter((m) => m.texture).length})`)
  check(PALETTE[0].name === 'Grass' && PALETTE[3].name === 'Rock' && PALETTE[7].name === 'Gravel', 'slots 0-7 keep their meaning')

  rig.focus.set(0, 0, 0)
  rig.zoom = 30
  rig.update(0)
  await settle()
  check(pickUp(editor, 'paint', { shape: 'polygon', material: 11, snap: true }), 'paint picks up as a polygon')
  check(editor.tool instanceof PaintPolygonTool, 'polygon shape uses the polygon tool')
  const click = (wx: number, wz: number) => {
    const p = editor.pixel.toScreen(new THREE.Vector3(wx, 0, wz), rig)!
    const pt = { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
    editor.tool.pointerMove?.(pt)
    editor.tool.pointerDown?.(pt)
    editor.tool.pointerUp?.(pt)
  }
  const before = s.history(s.currentBranch).length
  for (const [wx, wz] of [[-3, -3], [3, -3], [3, 3], [-3, 3], [-3, -3]]) click(wx, wz)
  await settle()
  check(terrainEdit.materialAt(s.doc, 0, 0) === 11 && terrainEdit.materialAt(s.doc, -3, -3) === 11, 'outline filled with cobblestone')
  check(terrainEdit.materialAt(s.doc, 3, 0) !== 11, 'cells outside the outline untouched')
  check(s.history(s.currentBranch).length === before + 1, 'one undo step')
  check(editor.tool instanceof PaintPolygonTool, 'the tool stays in hand')
  putDown(editor)

  // A 4 m swatch of every material, in rows of seven.
  s.edit('Swatches', () => {
    PALETTE.forEach((_, i) => {
      const x0 = -14 + (i % 7) * 4
      const z0 = -10 + Math.floor(i / 7) * 4
      for (const op of terrainBrush.polygonPaintOps(s.doc, [[x0, z0], [x0 + 4, z0], [x0 + 4, z0 + 4], [x0, z0 + 4]], i)) s.apply(op)
    })
  })
  await settle()
  await frame()
  await fetch('/__save?name=selftest-materials.png', { method: 'POST', body: x.canvas.toDataURL('image/png') }).catch(() => {})
}

/** The panels follow the UI rules (docs/UI.md) in every mode: one label column, tile rows on
 *  one line, two-column choices, settings under their switch, the tools container hidden with
 *  nothing in hand and the catalogue collapsed; History and View open; Selection shows a
 *  building's roof. Saves a window shot per view (panels-*.png). */
async function panelsTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  const demo = await fetch('fixtures/demo.pxmap').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  if (demo) x.open(new Uint8Array(demo), 'demo.pxmap')
  await settle()
  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)]
  const press = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  }
  const shot = async (name: string) => {
    await frame()
    await desktop?.test?.capture(`panels-${name}.png`)
  }
  const button = (root: string, text: string) => $$<HTMLButtonElement>(`${root} button`).find((b) => b.textContent?.trim() === text)
  const oneRow = (els: HTMLElement[]) => els.length > 0 && els.every((e) => e.offsetTop === els[0].offsetTop)
  const columns = (el: HTMLElement | null) => (el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0)
  const labelWidths = () => new Set($$('.field:not(.stack) > .label').filter((l) => l.offsetParent).map((l) => Math.round(l.getBoundingClientRect().width)))

  // Water: Draw / Erase switch, Shape as a setting, Depth and Shore only under Dig basin.
  press('o')
  await settle()
  check(button('.tools-box .verbs', 'Draw') && button('.tools-box .verbs', 'Erase'), 'water: Draw / Erase switch')
  check($('.tools-box .seg[aria-label="Shape"]'), 'water: shape is a setting')
  check(!$('.presets'), 'no preset button rows')
  check(columns($('.catalog .choices')) === 2, 'liquids in two columns')
  setParams('water', { dig: true })
  await settle()
  const withDig = $$('.tools-box .field.sub').length
  setParams('water', { dig: false })
  await settle()
  check(withDig === 2 && $$('.tools-box .field.sub').length === 0, `depth and shore only under Dig basin (${withDig})`)
  setParams('water', { dig: true })
  check(labelWidths().size === 1, `one label width (${[...labelWidths()].join(', ')})`)
  await shot('water')

  // Terrain: Sculpt shows the four effects on one row; Paint shows materials instead.
  press('t')
  await settle()
  button('.tools-box .verbs', 'Sculpt')?.click()
  await settle()
  check(oneRow($$('.catalog .tiles .tile')) && $$('.catalog .tiles .tile').length === 4, 'four effects on one row')
  await shot('terrain')
  button('.tools-box .verbs', 'Paint')?.click()
  await settle()
  check(!$('.catalog .tiles') && columns($('.catalog .choices')) === 2, 'paint shows materials only')
  await shot('paint')

  // Build: pieces in two rows (Structure: Floor, Wall, Stairs, Room; Openings), Erase in the switch; Level as a row.
  press('b')
  await settle()
  setParams('build', { kit: 'kenney_building_kit:interior' })
  await settle()
  const rows = $$('.catalog .tiles').slice(0, 2).map((t) => [...t.querySelectorAll<HTMLElement>('.tile')])
  check(rows.length === 2 && rows[0].length === 4 && rows[1].length === 3 && rows.every(oneRow), `Structure (4) and Openings (3) rows (${rows.map((r) => r.length).join(', ')})`)
  setParams('build', { kit: 'kenney_retro_urban:brick' })
  await settle()
  check(!$$('.catalog .tiles .tile').some((t) => t.textContent?.includes('Stairs')), 'no stairs for a kit without interiors')
  setParams('build', { kit: 'kenney_town:timber' })
  await settle()
  check(!$$('.catalog .tiles .tile').some((t) => t.textContent?.includes('Stairs')), 'no stairs for a kit without a stairs piece')
  check(button('.tools-box .verbs', 'Erase'), 'build: Erase in the switch')
  button('.tools-box .verbs', 'Erase')?.click()
  await settle()
  check(toolParams.build.piece === 'erase', 'Erase picks up erasing')
  button('.tools-box .verbs', 'Build')?.click()
  await settle()
  check(toolParams.build.piece !== 'erase', 'Build goes back to the last piece')
  // Premade: the switch shows whole buildings by category; picking one and clicking places it.
  button('.tools-box .verbs', 'Premade')?.click()
  await settle()
  const houses = $$('.catalog .choice.building')
  check(houses.length > 20 && $$('.catalog .heading').some((h) => h.textContent === 'Houses'), `premade catalogue (${houses.length} buildings)`)
  houses[3]?.click()
  await settle()
  check(inHand(editor) === 'premade' && editor.tool instanceof PlaceTool, 'a premade building in hand')
  const chosen = (editor.tool as PlaceTool).prop
  const pr = editor.pixel.toScreen(new THREE.Vector3(30, 0, 30), editor.rig)!
  const pt = { x: pr.x, y: pr.y, shift: false, alt: false, cmd: false }
  editor.tool.pointerMove?.(pt)
  editor.tool.pointerDown?.(pt)
  const placed = [...editor.session.doc.objects.values()].filter((o) => !o.deleted && o.props.get('prop') === chosen.id)
  check(placed.length === 1, `premade building placed (${chosen.id})`)
  await shot('premade')
  editor.session.undo()
  button('.tools-box .verbs', 'Build')?.click()
  await settle()
  await shot('build')

  // Props: placement settings in the tools container.
  press('p')
  await settle()
  check($('.tools-box button[role="switch"][aria-label="Random angle"]'), 'props: random rotation is a switch')
  await shot('props')

  // Collapsed catalogue with nothing in hand: no tools container; with a tool in hand: shown.
  putDown(editor)
  ;($$<HTMLButtonElement>('.rail button').find((b) => b.classList.contains('on')))?.click()
  await settle()
  check(!$('.tools-box'), 'tools container hidden with nothing in hand and the catalogue collapsed')
  pickUp(editor, 'water')
  await settle()
  check($('.tools-box') && !$('.catalog'), 'tools container shown with a tool in hand')
  ;($$<HTMLButtonElement>('.rail button').find((b) => b.classList.contains('on')))?.click()
  await settle()

  // Selection: a building shows its kit and roof.
  const building = [...editor.session.doc.objects.values()].find((o) => !o.deleted && o.type === 'building')
  press('v')
  await settle()
  if (building) {
    editor.selection.set([building.id])
    await settle()
    check($('.selection-box .seg[aria-label="Roof"]'), 'selection: roof of the building')
    // Its kit list only offers kits on the same grid (switching keeps the building's size).
    const grid = editor.library.kits.get(String(building.props.get('kit')))?.cellSize
    const offered = [...($('.selection-box select') as HTMLSelectElement | null)?.options ?? []].map((o) => editor.library.kits.get(o.value)?.cellSize)
    check(offered.length > 1 && offered.every((c) => c === grid), `kits on the same grid only (${offered.join(', ')})`)
    ui.showStats = true
    await settle()
    const stats = $('.stats')?.getBoundingClientRect()
    const box = $('.selection-box')?.getBoundingClientRect()
    check(stats && box && stats.bottom <= box.top, `stats line clear of Selection (${stats?.bottom} / ${box?.top})`)
    // A selected building is outlined on the ground; focusing X shows the axes, X bright.
    check(editor.marks.root.children.length === 1, `building outlined (${editor.marks.root.children.length})`)
    // (A background test window gets no focus events from .focus(): send them.)
    $<HTMLInputElement>('input[aria-label="Position X"]')?.dispatchEvent(new FocusEvent('focus'))
    await settle()
    const axes = editor.scene.children.find((o) => o.renderOrder === 20 && o.userData.overlay)
    check(axes && axes.children.length >= 8 && $$('.axis-letter').length === 3, `axes shown while editing X (${axes?.children.length}, ${$$('.axis-letter').length} letters)`)
    await shot('selection')
    const bp = building.props.get('position') as Vec3
    editor.rig.focus.set(bp.x, 0, bp.z)
    editor.rig.zoom = 26
    await settle()
    await shot('axes')
    $<HTMLInputElement>('input[aria-label="Position X"]')?.dispatchEvent(new FocusEvent('blur'))
    // A prop gets a ring around its base.
    const tree = [...editor.session.doc.objects.values()].find((o) => !o.deleted && o.type === 'prop' && String(o.props.get('prop')).includes('tree'))
    if (tree) {
      editor.selection.set([tree.id])
      const tp = tree.props.get('position') as Vec3
      editor.rig.focus.set(tp.x, 0, tp.z)
      editor.rig.zoom = 14
      await settle()
      check(editor.marks.root.children.length === 1, 'prop ringed')
      await shot('ring')
      // A model that isn't centered on its origin (Chimney): the ring goes around the model.
      const s = editor.session
      let chimney = ''
      s.edit('Chimney', () => (chimney = s.createObject('prop', { prop: 'kenney_town:chimney', position: new Vec3(tp.x + 3, 0, tp.z), rotation: 0 })))
      editor.selection.set([chimney])
      editor.rig.focus.set(tp.x + 3, 0, tp.z)
      editor.rig.zoom = 8
      await settle()
      await sleep(500) // the model's bounds load once
      const model = await loadModel(editor.library.props.get('kenney_town:chimney')!)
      const c = model.box.getCenter(new THREE.Vector3())
      const ring = new THREE.Box3().setFromObject(editor.marks.root).getCenter(new THREE.Vector3())
      check(Math.hypot(ring.x - (tp.x + 3 + c.x), ring.z - (tp.z + c.z)) < 0.05, `ring centered on the model (off by ${Math.hypot(ring.x - (tp.x + 3 + c.x), ring.z - (tp.z + c.z)).toFixed(2)} m; model center ${c.x.toFixed(2)}, ${c.z.toFixed(2)})`)
      await shot('ring-chimney')
      editor.selection.set([building.id])
      await settle()
    }
    await settle()
    check(axes?.children.length === 0 && $$('.axis-letter').length === 0, 'axes hidden after editing')
    ui.showStats = false
    editor.selection.clear()
    await settle()
    check(!$('.selection-box'), 'selection container hidden with nothing selected')
  }

  // View popover groups; History dialog.
  $<HTMLButtonElement>('button[aria-label="View settings"]')?.click()
  await settle()
  const headings = $$('.popover .heading').map((h) => h.textContent?.trim())
  check(['Look', 'Time', 'Display'].every((h) => headings.includes(h)), `view groups (${headings.join(', ')})`)
  await shot('view')
  $<HTMLButtonElement>('button[aria-label="View settings"]')?.click()
  $<HTMLButtonElement>('button[aria-label="History"]')?.click()
  await settle()
  check($$('.history .branches li').length >= 1, 'history dialog lists branches')
  await shot('history')
}

/** Top-down (U) eases to looking straight down and back; Walk (G) moves on the terrain with WASD
 *  and Esc returns to the editor view where the walk ended. */
async function cameraTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  const app = (window as any).pixelArena
  const { rig } = editor
  const press = (key: string, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, bubbles: true }))
  const tap = (key: string) => { press(key); press(key, false) }
  const snap = (name: string) => fetch(`/__save?name=${name}`, { method: 'POST', body: x.canvas.toDataURL('image/png') }).catch(() => {})
  // The demo map, so the shots show something to walk among.
  const demo = await fetch('fixtures/demo.pxmap').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  if (demo) x.open(new Uint8Array(demo), 'demo.pxmap')
  rig.focus.set(0, 0, 0)
  rig.zoom = 40
  await settle()
  const iso = rig.pitch
  tap('u')
  await sleep(1200)
  check(Math.abs(rig.pitch + Math.PI / 2) < 1e-3, `U looks straight down (${rig.pitch.toFixed(3)})`)
  await snap('selftest-camera-top.png')
  tap('u')
  await sleep(1200)
  check(Math.abs(rig.pitch - iso) < 1e-3, `U again goes back to isometric (${rig.pitch.toFixed(3)})`)

  // Compass: north turns with the view; clicking it faces north.
  rig.rotateBy(Math.PI / 2)
  await sleep(800)
  const compass = document.querySelector<HTMLButtonElement>('.compass')
  check(compass, 'compass shown')
  compass?.click()
  await sleep(1000)
  const yaw = ((rig.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  check(Math.min(yaw, Math.PI * 2 - yaw) < 1e-3, `compass click faces north (yaw ${rig.yaw.toFixed(3)})`)
  check(compass?.textContent?.includes('N'), `compass reads N (${compass?.textContent?.trim()})`)
  await desktop?.test?.capture('camera-compass.png')

  tap('g')
  await frame()
  check(app.walking, 'G starts walking')
  check(x.canvas.parentElement?.classList.contains('walking'), 'the UI hides while walking')
  const start = app.walk.position.clone()
  press('w')
  await sleep(800)
  press('w', false)
  await frame()
  await snap('selftest-camera-walk.png')
  const moved = app.walk.position.clone().sub(start)
  check(Math.hypot(moved.x, moved.z) > 2, `W walks forward (${Math.hypot(moved.x, moved.z).toFixed(2)} m)`)
  const floor = terrainEdit.heightAtWorld(editor.session.doc, app.walk.position.x, app.walk.position.z)
  check(Math.abs(app.walk.position.y - floor) < 1e-3, 'feet stay on the terrain')
  const gl = app.pixel.renderer.getContext() as WebGL2RenderingContext
  check(gl.getError() === gl.NO_ERROR, 'perspective render has no GL errors')
  tap('Escape')
  await frame()
  check(!app.walking, 'Esc stops walking')
  check(Math.hypot(rig.focus.x - app.walk.position.x, rig.focus.z - app.walk.position.z) < 1e-3, 'the editor view moves to where the walk ended')
}

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

  // Option/Alt + scroll turns the view (one mouse notch, 100 px, is 15°) and doesn't zoom.
  await sleep(400)
  const yawBefore = rig.yaw
  const zoomBefore = rig.zoom
  await wheel({ deltaY: 100, altKey: true })
  check(Math.abs(rig.yaw - yawBefore - Math.PI / 12) < 1e-6, `Alt+scroll rotates (${(((rig.yaw - yawBefore) * 180) / Math.PI).toFixed(1)}°)`)
  check(rig.zoom === zoomBefore, 'Alt+scroll does not zoom')
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
    lastWaterAdded.ids = []
    for (const [cx, cz] of [[x0, z0], [x0 + size, z0], [x0 + size, z0 + size], [x0, z0 + size], [x0, z0]]) {
      tool.pointerMove(at(cx, cz))
      tool.pointerDown(at(cx, cz))
    }
    const id = lastWaterAdded.ids[0]
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
  check(inHand(editor) === 'water', 'the tool stays in hand afterwards')
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
  editor.selection.set(lava ? [lava.id] : [])
  await settle()
  check(lava && editor.world.objectRoot(lava.id) && editor.marks.root.children.length === 1, 'lava rendered and marked')
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

/** Groups, locks, names and custom order (map data, undoable), the select tool's handling of
 *  them, and the outliner's sections and order. */
async function outlinerTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>, x: SelfTestExtras) {
  await openDemo(x, settle)
  const s = editor.session
  const doc = s.doc
  const lib = editor.library
  editor.setTool(editor.defaultTool())
  const props = [...doc.objects.values()].filter((o) => !o.deleted && o.type === 'prop' && !o.props.has('parent')).slice(0, 3).map((o) => o.id)
  const [a, b, c] = props

  // Group two props.
  const g = grouping.groupSelection(s, [a, b], lib)!
  check(g && doc.getObject(g)?.type === 'group', 'group created')
  check(grouping.members(doc, g).sort().join() === [a, b].sort().join(), 'group has both members')
  check(grouping.pickTargets(doc, a).length === 2, 'picking a member selects the group')
  check(s.branch().txns.at(-1)?.label === 'Group 2 objects', `group label (${s.branch().txns.at(-1)?.label})`)
  s.undo()
  check(!doc.getObject(g) || doc.getObject(g)!.deleted, 'undo removes the group')
  check(grouping.parentGroup(doc, a) === null, 'undo clears membership')
  s.redo()
  check(grouping.parentGroup(doc, a) === g, 'redo restores it')

  // Rename and lock.
  grouping.rename(s, g, 'Camp', lib)
  check(s.branch().txns.at(-1)?.label === 'Rename Group 1 to Camp' || s.branch().txns.at(-1)?.label?.startsWith('Rename Group'), `rename label (${s.branch().txns.at(-1)?.label})`)
  grouping.setLocked(s, [g], true, lib)
  check(grouping.isLocked(doc, a) && grouping.isLocked(doc, b), 'locking the group locks its members')
  check(grouping.editable(doc, [a, b, c]).join() === c, 'locked objects are not editable')
  editor.selection.set([a, c])
  const sel = editor.tool as SelectTool
  const before = doc.objects.size
  sel.deleteSelection()
  check(!doc.getObject(a)!.deleted && doc.getObject(c)!.deleted, 'delete skips locked objects')
  s.undo()
  check(doc.objects.size === before && !doc.getObject(c)!.deleted, 'undo delete')
  grouping.setLocked(s, [g], false, lib)

  // Duplicating the whole group makes a new group of copies.
  editor.selection.set(grouping.members(doc, g))
  sel.duplicateSelection()
  const groups = [...doc.objects.values()].filter((o) => !o.deleted && o.type === 'group')
  check(groups.length === 2, `duplicate makes a new group (${groups.length})`)
  const copyGroup = groups.find((o) => o.id !== g)!
  check(grouping.members(doc, copyGroup.id).length === 2 && editor.selection.list().every((id) => grouping.parentGroup(doc, id) === copyGroup.id), 'copies are in the new group')
  s.undo()

  // Custom order and sections.
  grouping.reorder(s, [c, g], null, 'Reorder')
  const custom = outline(doc, lib, { query: '', groupBy: 'none', sort: 'custom', collapsed: new Set() })
  const top = custom[0].rows.filter((r) => r.depth === 0).map((r) => r.id)
  check(top[0] === c && top[1] === g, 'custom order puts reordered items first')
  check(custom[0].rows.some((r) => r.id === a && r.depth === 1), 'members nest under their group')
  const collapsed = outline(doc, lib, { query: '', groupBy: 'none', sort: 'custom', collapsed: new Set([g]) })
  check(!collapsed[0].rows.some((r) => r.id === a), 'a collapsed group hides its members')
  const byType = outline(doc, lib, { query: '', groupBy: 'type', sort: 'name', collapsed: new Set() })
  check(byType[0].key === 'group' && byType.some((sec) => sec.key === 'prop'), 'type sections, groups first')
  const byCat = outline(doc, lib, { query: '', groupBy: 'category', sort: 'name', collapsed: new Set() })
  check(byCat.some((sec) => sec.key.startsWith('cat:')), 'category sections')

  // Ungroup.
  grouping.ungroup(s, g, lib)
  check(doc.getObject(g)!.deleted && grouping.parentGroup(doc, a) === null, 'ungroup dissolves the group')
  editor.selection.clear()
}

/** Water never overlaps: the same liquid merges (keeping the height it started in), another
 *  liquid is replaced (islands become holes), the same liquid at another height stays apart, the
 *  brush paints a stroke, and erasing cuts water away (splitting a body if needed). Each is one
 *  undo step. */
async function waterRulesTest(editor: Editor, check: (ok: unknown, what: string) => void, settle: () => Promise<void>) {
  await settle()
  const s = editor.session
  const doc = s.doc
  const sq = (x: number, z: number, size: number) => [[[[x, z], [x + size, z], [x + size, z + size], [x, z + size]]]] as [number, number][][][]
  const water = () => [...doc.objects.values()].filter((o) => !o.deleted && o.type === 'water')
  const of = (liquid: string) => water().filter((o) => o.props.get('liquid') === liquid)
  const add = (shape: [number, number][][][], liquid: string, start: [number, number], label = 'Add') =>
    s.edit(label, () => addWater(s, shape, { liquid, dig: true, depth: 1.5, shore: 2, start }))
  const noOverlaps = () => {
    const w = water()
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (overlapArea(worldShape(w[i]), worldShape(w[j])) > 0.01) return false
    return true
  }
  const area = (o: { id: string } | undefined) => (o ? shapeArea(worldShape(doc.getObject(o.id)!)) : 0)

  add(sq(0, 0, 8), 'water', [0, 0])
  check(of('water').length === 1 && Math.abs(area(of('water')[0]) - 64) < 0.5, 'a lake')
  const level = (of('water')[0].props.get('position') as Vec3).y

  // Same liquid overlapping, started inside the lake: one body, the lake's height.
  add(sq(6, 6, 8), 'water', [7, 7])
  check(of('water').length === 1, `same liquid merges (${of('water').length} bodies)`)
  check(Math.abs(area(of('water')[0]) - (64 + 64 - 4)) < 0.5, `merged area (${area(of('water')[0]).toFixed(1)})`)
  check(Math.abs((of('water')[0].props.get('position') as Vec3).y - level) < 1e-6, 'keeps the height it started in')
  s.undo()
  check(of('water').length === 1 && Math.abs(area(of('water')[0]) - 64) < 0.5, 'undo restores the lake')
  s.redo()

  // Another liquid replaces water where it goes.
  add(sq(10, 10, 6), 'lava', [16, 16])
  check(of('lava').length === 1 && Math.abs(area(of('lava')[0]) - 36) < 0.5, 'lava placed')
  check(noOverlaps(), 'no overlaps after lava')
  check(Math.abs(area(of('water')[0]) - (124 - 16)) < 0.5, `the lake gave way (${area(of('water')[0]).toFixed(1)})`)

  // An island of tar inside the lake: the lake gets a hole.
  add(sq(2, 2, 2), 'tar', [3, 3])
  const holes = of('water')[0].props.get('holes')
  check(Array.isArray(holes) && holes.length === 1, 'an island becomes a hole')
  check(noOverlaps(), 'no overlaps after the island')

  // Same liquid, clearly another height: kept apart, the new water stops at the lake's edge.
  s.edit('Raise', () => s.setProp(of('lava')[0].id, 'position', (of('lava')[0].props.get('position') as Vec3).add(new Vec3(0, 1, 0))))
  add(sq(14, 8, 6), 'lava', [19, 9])
  check(of('lava').length === 2 && noOverlaps(), `lava at another height stays apart (${of('lava').length})`)

  // The brush: a stroke of water joins the lake it starts in.
  const before = area(of('water')[0])
  pickUp(editor, 'water', { shape: 'brush', liquid: 'water', radius: 1.5, dig: true })
  const brush = editor.tool
  const at = (x: number, z: number): Pointer => {
    const p = editor.pixel.toScreen(new THREE.Vector3(x, terrainEdit.heightAtWorld(doc, x, z), z), editor.rig)!
    return { x: p.x, y: p.y, shift: false, alt: false, cmd: false }
  }
  editor.rig.focus.set(4, 0, 4)
  editor.rig.zoom = 50
  editor.rig.update(0)
  await settle()
  brush.pointerDown?.(at(1, 1))
  for (let x = 1; x >= -8; x -= 0.5) brush.pointerMove?.(at(x, 1))
  brush.pointerUp?.(at(-8, 1))
  check(of('water').length === 1 && area(of('water')[0]) > before + 15, `the brush stroke joins the lake (${area(of('water')[0]).toFixed(1)})`)
  check(s.branch().txns.at(-1)?.label === 'Draw water', `brush label (${s.branch().txns.at(-1)?.label})`)
  const stroke = strokeShape([[0, 0], [4, 0]], 1)
  check(Math.abs(shapeArea(stroke) - (Math.PI + 8)) < 0.3, `stroke area (${shapeArea(stroke).toFixed(2)})`)

  // Erasing a band across the lake splits it in two.
  const lakesBefore = of('water').length
  s.edit('Erase water', () => eraseWater(s, [[[[-9, 4.5], [8.5, 4.5], [8.5, 5.5], [-9, 5.5]]]]))
  check(of('water').length === lakesBefore + 1, `erasing across splits the lake (${of('water').length})`)
  check(noOverlaps(), 'still no overlaps')

  // Erasing a hole: dry land inside, a sloped shore around it (not a pit with walls).
  const h = (x: number, z: number) => terrainEdit.heightAtWorld(doc, x, z)
  add(sq(30, 0, 14), 'water', [30, 0])
  const pond = of('water').find((o) => containsPointOf(o, 37, 7))!
  const pondLevel = (pond.props.get('position') as Vec3).y
  check(h(37, 7) < pondLevel - 1, `pond dug (${h(37, 7).toFixed(2)})`)
  s.edit('Erase water', () => eraseWater(s, strokeShape([[37, 7]], 2)))
  const holes2 = of('water').find((o) => containsPointOf(o, 31, 1))?.props.get('holes')
  check(Array.isArray(holes2) && holes2.length === 1, 'erasing inside makes a hole')
  check(Math.abs(h(37, 7) - (pondLevel + 0.05)) < 0.02, `the hole is dry land (${h(37, 7).toFixed(2)})`)
  check(h(37, 9.6) > pondLevel - 0.6 && h(37, 9.6) < pondLevel, `a sloped shore around the hole (${h(37, 9.6).toFixed(2)})`)

  // Erasing a circle with a slightly offset circle leaves no thin ring behind.
  const ringBefore = water().length
  add(strokeShape([[60, 20]], 4), 'water', [60, 20])
  s.edit('Erase water', () => eraseWater(s, strokeShape([[60.3, 20]], 4)))
  check(water().length === ringBefore, `no sliver left (${water().length} bodies, was ${ringBefore})`)

  // Two lakes joined by a stroke become one body with no ridge where they met.
  add(sq(0, 40, 6), 'water', [0, 40])
  add(sq(10, 40, 6), 'water', [10, 40])
  const ridgeBefore = h(8, 43)
  add(strokeShape([[3, 43], [13, 43]], 1.5), 'water', [3, 43])
  check(of('water').filter((o) => containsPointOf(o, 3, 43) || containsPointOf(o, 13, 43)).length === 1, 'the lakes merge into one')
  check(h(8, 43) < ridgeBefore - 0.3 || ridgeBefore < -1, `no ridge at the join (${ridgeBefore.toFixed(2)} → ${h(8, 43).toFixed(2)})`)
  check(h(6, 43) < -0.8, `the old shore is dug out (${h(6, 43).toFixed(2)})`)

  // Polygon erase: the outline is cut out like the brush's stroke.
  pickUp(editor, 'waterErase', { shape: 'polygon', snap: true })
  check(editor.tool instanceof WaterTool, 'Erase with the polygon shape uses the outline tool')
  pickUp(editor, 'waterErase', { shape: 'brush' })
  check(editor.tool instanceof WaterBrushTool, 'switching the shape swaps the tool in hand')
  pickUp(editor, 'waterErase', { shape: 'polygon' })
  const eraser = editor.tool as WaterTool
  const areaBefore = area(of('water').find((o) => containsPointOf(o, 31, 1)))
  editor.rig.focus.set(37, 0, 7)
  editor.rig.update(0)
  await settle()
  for (const [x, z] of [[31, 1], [34, 1], [34, 4], [31, 4], [31, 1]] as [number, number][]) {
    eraser.pointerMove(at(x, z))
    eraser.pointerDown(at(x, z))
  }
  const pondAfter = of('water').find((o) => containsPointOf(o, 37, 1))
  check(pondAfter && area(pondAfter) < areaBefore - 8, `polygon erase cut the corner out (${areaBefore.toFixed(1)} → ${area(pondAfter).toFixed(1)})`)
  check(s.branch().txns.at(-1)?.label === 'Erase water', 'polygon erase label')

  // Shift keeps each new side at a multiple of 45°.
  pickUp(editor, 'water', { shape: 'polygon', snap: true, liquid: 'water' })
  const drawer = editor.tool as WaterTool
  const sh = (x: number, z: number): Pointer => ({ ...at(x, z), shift: true })
  drawer.pointerMove(at(80, 0))
  drawer.pointerDown(at(80, 0))
  drawer.pointerMove(sh(84, 0.7)) // nearly along +x: snaps to the axis
  drawer.pointerDown(sh(84, 0.7))
  drawer.pointerMove(sh(87.2, 3.4)) // nearly diagonal: snaps to 45°
  drawer.pointerDown(sh(87.2, 3.4))
  const pts = (drawer as unknown as { points: THREE.Vector3[] }).points
  check(pts.length === 3 && Math.abs(pts[1].z - 0) < 1e-6, `Shift keeps the first side on the axis (${pts[1]?.z})`)
  check(pts.length === 3 && Math.abs((pts[2].x - pts[1].x) - (pts[2].z - pts[1].z)) < 1e-6, `Shift keeps the second side at 45° (${pts[2] && (pts[2].x - pts[1].x).toFixed(2)}, ${pts[2] && (pts[2].z - pts[1].z).toFixed(2)})`)
  drawer.key(new KeyboardEvent('keydown', { key: 'Escape' }))
  putDown(editor)
}

function containsPointOf(o: { props: Map<string, unknown> } & Parameters<typeof worldShape>[0], x: number, z: number): boolean {
  return containsPoint(worldShape(o), x, z)
}
