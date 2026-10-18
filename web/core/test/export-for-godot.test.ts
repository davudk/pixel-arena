// Writes a TS-saved project for the Godot cross-check (only when PXMAP_OUT is set):
//   PXMAP_OUT=/tmp/ts-sample.pxmap npx vitest run test/export-for-godot.test.ts
// It opens the Godot fixture, makes new edits of every kind, and saves.
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { MAIN, openProject, PackedVec2Array, Rect2i, saveProject, terrainEdit, Vec2, Vec3 } from '../src'

it.runIf(!!process.env.PXMAP_OUT)('export a TS-edited project for Godot', () => {
  const s = openProject(new Uint8Array(readFileSync(new URL('./fixtures/godot-sample.pxmap', import.meta.url))), 'bob')
  s.switchBranch(MAIN)
  s.edit('TS place', () => {
    s.createObject('prop', { prop: 'kenney_nature:rock_large_a', position: new Vec3(10.5, 0, 10.5), rotation: 1.25 })
  })
  s.edit('TS water', () => {
    s.createObject('water', { position: new Vec3(40, -1, 40), rotation: 0, polygon: new PackedVec2Array([new Vec2(-2, -2), new Vec2(2, -2), new Vec2(0, 2)]) })
  })
  s.edit('TS terrain', () => terrainEdit.heightOps(s.doc, new Rect2i(62, 62, 4, 4), () => 3.5).forEach((op) => s.apply(op)))
  s.fork('From TS')
  s.edit('TS branch edit', () => s.setProp([...s.doc.objects.keys()][1], 'variant', 'ts'))
  writeFileSync(process.env.PXMAP_OUT!, saveProject(s))
  expect(s.branches.size).toBe(3)
})
