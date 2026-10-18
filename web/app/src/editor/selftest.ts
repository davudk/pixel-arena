// End-to-end self-tests that drive the real editor code in the browser (the web counterpart of
// tests/smoke_editor.gd). Run with ?selftest=place; results go to web/app/shots/selftest-<name>.json
// (dev server) and the page title becomes "SELFTEST PASS" / "SELFTEST FAIL".

import * as THREE from 'three'
import { merge, openProject, saveProject, Vec3 } from '@pixel-arena/core'
import type { Editor, Pointer } from './editor'
import { PlaceTool } from './place-tool'
import { SelectTool } from './select-tool'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runSelfTest(name: string, editor: Editor, busy: () => boolean) {
  const failures: string[] = []
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
    else failures.push(`unknown self-test '${name}'`)
  } catch (e) {
    failures.push(`exception: ${(e as Error).stack ?? e}`)
  }
  const result = { test: name, pass: failures.length === 0, failures }
  console.log('selftest', result)
  await fetch(`/__save?name=selftest-${name}.json`, {
    method: 'POST', body: 'data:application/json;base64,' + btoa(JSON.stringify(result, null, 2)),
  }).catch(() => {})
  document.title = result.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL'
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
