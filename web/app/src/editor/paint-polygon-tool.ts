// Terrain paint by polygon outline: the polygon shape of the "paint" tool. Draw an outline
// (polygon-tool.ts); when it closes, every 1 m cell whose center is inside gets the material
// (one edit, one undo step). The tool stays in hand for the next outline.

import { terrainBrush } from '@pixel-arena/core'
import { PALETTE } from '../render/terrain-shading'
import type { Editor } from './editor'
import { paintLabel } from './labels'
import { PolygonTool } from './polygon-tool'
import { params } from './tool-params'

export class PaintPolygonTool extends PolygonTool {
  readonly name = 'paint'

  constructor(editor: Editor) {
    super(editor)
  }

  protected color() {
    return PALETTE[params.paint.material]?.color ?? '#ffffff'
  }

  protected snaps() {
    return params.paint.snap
  }

  protected commit(ring: [number, number][]) {
    const s = this.editor.session
    const material = params.paint.material
    s.edit(paintLabel(material), () => {
      for (const op of terrainBrush.polygonPaintOps(s.doc, ring, material)) s.apply(op)
    })
  }
}
