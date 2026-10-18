// End-to-end self-tests that drive the real editor code in the browser (the web counterpart of
// tests/smoke_editor.gd). Run with ?selftest=place; results go to web/app/shots/selftest-<name>.json
// (dev server) and the page title becomes "SELFTEST PASS" / "SELFTEST FAIL".

import * as THREE from 'three'
import { merge, openProject, saveProject, Vec3 } from '@pixel-arena/core'
import { idleTool, type Editor, type Pointer } from './editor'
import { PlaceTool } from './place-tool'

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
  check(editor.tool === idleTool, 'Esc stops placing')
  const reopened = openProject(saveProject(s))
  check(merge.diff(s.doc, reopened.doc).size === 0, 'save/open round trip')
}
