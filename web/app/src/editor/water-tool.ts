// Water by polygon outline (port of WaterTool): the polygon shape of two registry tools, "water"
// (draws params.water.liquid) and "waterErase" (cuts the outline out of any water). Outline
// drawing is shared with terrain paint (polygon-tool.ts).
//
// Drawn shapes go through the water rules in water-shapes.ts: they merge with the same liquid
// it touches (keeping the height of the body it started in), replaces other liquids where it
// overlaps them, and on dry ground (params.water.dig, the default) sits at the lowest ground
// along its edge with a basin dug beneath it. All of it is one edit (one undo step).
//
// The polygon is stored relative to the object's position, so moving / rotating water works like
// any other object; PageUp / PageDown in the select tool raise or lower the surface.

import { liquid } from '../world/liquids'
import type { Editor } from './editor'
import { drawLabel } from './labels'
import { PolygonTool } from './polygon-tool'
import { params } from './tool-params'
import { addWater, eraseWater, noteWaterAdded } from './water-shapes'

export { selfIntersects } from './polygon-tool'

export class WaterTool extends PolygonTool {
  constructor(editor: Editor, readonly name: 'water' | 'waterErase' = 'water') {
    super(editor)
  }

  // Erasing draws in the danger red; drawing in the liquid's color.
  protected color() {
    return this.name === 'waterErase' ? '#ff8a7a' : liquid(params.water.liquid).shallow
  }

  protected snaps() {
    return params[this.name].snap
  }

  /** Adds the outline as water (merging, replacing, digging; see water-shapes.ts), or cuts it
   *  out of any water. The tool stays in hand for the next outline. */
  protected commit(ring: [number, number][], start: [number, number]) {
    const s = this.editor.session
    if (this.name === 'waterErase') {
      s.edit('Erase water', () => eraseWater(s, [[ring]]))
      return
    }
    const w = params.water
    let ids: string[] = []
    s.edit(drawLabel(w.liquid), () => {
      ids = addWater(s, [[ring]], { liquid: w.liquid, dig: w.dig, depth: w.depth, shore: w.shore, start })
    })
    noteWaterAdded(ids)
  }
}
