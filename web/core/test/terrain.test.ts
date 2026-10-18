import { describe, expect, it, vi } from 'vitest'
import { log, MapDocument, ops, Rect2i, terrainBrush, terrainChunk, terrainEdit, Vec2i, Vec3 } from '../src'

const { heightAt, heightAtWorld, heightOps, materialAt, materialOps, raycast } = terrainEdit
const { SAMPLES, MATERIAL } = terrainChunk

function setup() {
  const doc = new MapDocument()
  const apply = (list: ops.Op[]) => list.forEach((op) => doc.applyOp(op))
  return { doc, apply }
}

describe('terrain chunks and edits', () => {
  it('untouched terrain is implicit', () => {
    const { doc } = setup()
    expect(heightAt(doc, 1000, -1000)).toBe(0)
    expect(doc.terrain.size).toBe(0)
  })

  it('interior sample touches one chunk', () => {
    const { doc, apply } = setup()
    const list = heightOps(doc, new Rect2i(5, 5, 1, 1), () => 2)
    expect(list).toHaveLength(1)
    apply(list)
    expect(heightAt(doc, 5, 5)).toBe(2)
  })

  it('corner sample is written to all four chunks', () => {
    const { doc, apply } = setup()
    const list = heightOps(doc, new Rect2i(32, 32, 1, 1), () => 3)
    expect(list).toHaveLength(4)
    apply(list)
    const n = SAMPLES
    expect(doc.getChunk(new Vec2i(0, 0))!.heights[n * n - 1]).toBe(3)
    expect(doc.getChunk(new Vec2i(1, 1))!.heights[0]).toBe(3)
    expect(doc.getChunk(new Vec2i(0, 1))!.heights[32]).toBe(3)
    expect(doc.getChunk(new Vec2i(1, 0))!.heights[32 * n]).toBe(3)
  })

  it('negative border samples', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(-32, 0, 1, 1), () => 1))
    expect(heightAt(doc, -32, 0)).toBe(1)
    expect(doc.terrain.has('-1,0')).toBe(true)
    expect(doc.terrain.has('-2,0')).toBe(true)
  })

  it('unchanged values produce no ops', () => {
    const { doc } = setup()
    expect(heightOps(doc, new Rect2i(0, 0, 4, 4), (_x, _z, o) => o)).toHaveLength(0)
  })

  it('chunk dropped when back to default', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(5, 5, 1, 1), () => 2))
    expect(doc.terrain.size).toBe(1)
    apply(heightOps(doc, new Rect2i(5, 5, 1, 1), () => 0))
    expect(doc.terrain.size).toBe(0)
  })

  it('material paint across chunks', () => {
    const { doc, apply } = setup()
    apply(materialOps(doc, new Rect2i(30, 0, 4, 1), () => 7))
    expect(doc.terrain.size).toBe(2)
    for (let x = 30; x < 34; x++) expect(materialAt(doc, x, 0)).toBe(7)
    expect(materialAt(doc, 34, 0)).toBe(0)
  })

  it('terrain op records prev', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(1, 1, 2, 1), () => 1))
    const list = heightOps(doc, new Rect2i(1, 1, 2, 1), (x) => x * 2)
    const applied = doc.applyOp(list[0]) as ops.TerrainOp
    expect(Array.from(applied.prev!)).toEqual([1, 1])
    expect(heightAt(doc, 2, 1)).toBe(4)
  })

  it('invalid rect rejected', () => {
    const spy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const { doc } = setup()
    expect(doc.applyOp(ops.terrain(Vec2i.ZERO, MATERIAL, new Rect2i(31, 0, 2, 1), new Uint8Array([1, 1])))).toBeNull()
    spy.mockRestore()
  })
})

describe('terrain tools', () => {
  it('heightAtWorld interpolates', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(1, 0, 1, 1), () => 2))
    expect(heightAtWorld(doc, 1, 0)).toBe(2)
    expect(heightAtWorld(doc, 0.5, 0)).toBeCloseTo(1)
    expect(heightAtWorld(doc, 1.5, 0.5)).toBeCloseTo(0.5)
  })

  it('height range tracks edits', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(3, 3, 1, 1), () => 5))
    apply(heightOps(doc, new Rect2i(40, 3, 1, 1), () => -2))
    expect(doc.heightRange()).toEqual([-2, 5])
  })

  it('raycast flat ground', () => {
    const { doc } = setup()
    const hit = raycast(doc, new Vec3(3, 50, 3), new Vec3(0, -1, 0))
    expect(hit && hit.distanceTo(new Vec3(3, 0, 3))).toBeLessThan(0.01)
  })

  it('raycast hits the near side of a hill first', () => {
    const { doc, apply } = setup()
    apply(terrainBrush.sculptOps(doc, 'raise', new Vec3(10, 0, 0), 4, 6))
    const hit = raycast(doc, new Vec3(-20, 3, 0), new Vec3(1, -0.1, 0))!
    expect(hit).not.toBeNull()
    expect(hit.x).toBeLessThan(10)
    expect(hit.x).toBeGreaterThan(5)
    expect(Math.abs(hit.y - heightAtWorld(doc, hit.x, hit.z))).toBeLessThan(0.01)
  })

  it('raycast pointing up misses', () => {
    const { doc } = setup()
    expect(raycast(doc, new Vec3(0, 5, 0), new Vec3(0, 1, 0))).toBeNull()
  })

  it('raise and lower falloff', () => {
    const { doc, apply } = setup()
    apply(terrainBrush.sculptOps(doc, 'raise', Vec3.ZERO, 3, 1))
    expect(heightAt(doc, 0, 0)).toBeCloseTo(1)
    const mid = heightAt(doc, 2, 0)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(heightAt(doc, 3, 0)).toBe(0)
    apply(terrainBrush.sculptOps(doc, 'lower', Vec3.ZERO, 3, 1))
    expect(heightAt(doc, 0, 0)).toBeCloseTo(0)
  })

  it('flatten moves toward target', () => {
    const { doc, apply } = setup()
    apply(terrainBrush.sculptOps(doc, 'raise', Vec3.ZERO, 4, 4))
    apply(terrainBrush.sculptOps(doc, 'flatten', Vec3.ZERO, 6, 1, 1))
    expect(heightAt(doc, 0, 0)).toBeCloseTo(1)
  })

  it('smooth reduces a spike', () => {
    const { doc, apply } = setup()
    apply(heightOps(doc, new Rect2i(5, 5, 1, 1), () => 9))
    apply(terrainBrush.sculptOps(doc, 'smooth', new Vec3(5, 0, 5), 2, 1))
    const h = heightAt(doc, 5, 5)
    expect(h).toBeLessThan(9)
    expect(h).toBeGreaterThan(0)
  })

  it('paint circle', () => {
    const { doc, apply } = setup()
    apply(terrainBrush.paintOps(doc, Vec3.ZERO, 2, 3))
    expect(materialAt(doc, 0, 0)).toBe(3)
    expect(materialAt(doc, -2, -1)).toBe(3)
    expect(materialAt(doc, 2, 2)).toBe(0)
  })
})
