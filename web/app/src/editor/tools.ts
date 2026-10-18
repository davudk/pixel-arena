// The tool registry: every tool the editor has, which mode (left-panel view) it belongs to, its
// parameters (with ranges, presets, which ones a saved tool keeps and when they apply), how to
// describe it, and how to create it. Panels, the bottom bar, saved tools and number keys all
// work from this list, so a new tool is one entry here plus its implementation.
//
// Parameter values live in tool-params.ts; picking up a tool with a patch (pickUp) is the one
// way the UI arms a tool.

import type { Library } from '../library/library'
import { PALETTE } from '../render/terrain-shading'
import { BuildingTool } from './building-tool'
import type { Editor, Tool } from './editor'
import { opName, pieceName } from './labels'
import { PlaceTool } from './place-tool'
import { SelectTool } from './select-tool'
import { TerrainTool } from './terrain-tool'
import { MAX_LEVEL, params, setParams, type ParamTool, type ToolParams } from './tool-params'
import { WaterTool } from './water-tool'

export type ToolId = 'select' | ParamTool
/** Left-panel views; each tool belongs to one. */
export type Mode = 'select' | 'props' | 'terrain' | 'water' | 'build'

export interface Option<V = string | number> {
  value: V
  label: string
  icon?: string
}

export interface ParamDef {
  key: string
  label: string
  /** range: slider with presets · toggle: on/off button · stepper: − value + · choice: one of
   *  `options` · material / prop / kit: picked from the panel's own catalogue. */
  kind: 'range' | 'toggle' | 'stepper' | 'choice' | 'material' | 'prop' | 'kit'
  min?: number
  max?: number
  step?: number
  presets?: number[]
  format?: (v: number) => string
  options?: Option[]
  icon?: string
  /** Kept by saved tools (default true). */
  saved?: boolean
  /** Shown in the bottom bar (quick settings) rather than the panel. */
  quick?: boolean
  /** When the parameter matters for the current values; otherwise it's shown disabled. */
  applies?: (p: Record<string, unknown>, library: Library) => boolean
  /** Why it doesn't apply (tooltip). */
  why?: string
}

export interface ToolDef {
  id: ToolId
  mode: Mode
  label: string
  icon: string
  saveable: boolean
  params: ParamDef[]
  create: (editor: Editor) => Tool | null
  /** Short description of the settings (saved-tool names, tooltips). */
  describe: (p: Record<string, unknown>, library: Library | null) => string
}

const meters = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} m`
const percent = (v: number) => `${Math.round(v * 100)}%`
const RADIUS: ParamDef = { key: 'radius', label: 'Size', kind: 'range', min: 1, max: 32, step: 0.5, presets: [1, 2, 4, 8, 16, 32], format: meters }

export const TOOLS: Record<ToolId, ToolDef> = {
  select: {
    id: 'select', mode: 'select', label: 'Select', icon: 'pointer', saveable: false, params: [],
    create: (editor) => new SelectTool(editor),
    describe: () => 'Select',
  },
  place: {
    id: 'place', mode: 'props', label: 'Place prop', icon: 'cube', saveable: true,
    params: [
      { key: 'prop', label: 'Prop', kind: 'prop' },
      { key: 'randomRotation', label: 'Random rotation', kind: 'toggle', icon: 'shuffle', quick: true },
      {
        key: 'snap', label: 'Snap', kind: 'toggle', icon: 'magnet', quick: true,
        applies: (p, library) => library.props.get(String(p.prop))?.mode !== 'free', why: 'This prop always places freely',
      },
    ],
    create: (editor) => {
      const prop = editor.library.props.get(params.place.prop)
      return prop ? new PlaceTool(editor, prop) : null
    },
    describe: (p, library) => {
      const extras = [p.randomRotation ? 'random rotation' : '', p.snap === false ? 'no snap' : ''].filter(Boolean)
      return `${library?.props.get(String(p.prop))?.name ?? String(p.prop)}${extras.length ? ` · ${extras.join(', ')}` : ''}`
    },
  },
  sculpt: {
    id: 'sculpt', mode: 'terrain', label: 'Sculpt', icon: 'raise', saveable: true,
    params: [
      {
        key: 'op', label: 'Shape', kind: 'choice',
        options: (['raise', 'lower', 'smooth', 'flatten'] as const).map((v) => ({ value: v, label: opName(v), icon: v })),
      },
      RADIUS,
      { key: 'strength', label: 'Strength', kind: 'range', min: 0.05, max: 1, step: 0.05, presets: [0.1, 0.25, 0.5, 0.75, 1], format: percent },
    ],
    create: (editor) => new TerrainTool(editor, 'sculpt'),
    describe: (p) => `${opName(p.op as ToolParams['sculpt']['op'])} · ${meters(Number(p.radius))} · ${percent(Number(p.strength))}`,
  },
  paint: {
    id: 'paint', mode: 'terrain', label: 'Paint', icon: 'brush', saveable: true,
    params: [{ key: 'material', label: 'Material', kind: 'material' }, RADIUS],
    create: (editor) => new TerrainTool(editor, 'paint'),
    describe: (p) => `Paint ${PALETTE[Number(p.material)]?.name ?? ''} · ${meters(Number(p.radius))}`,
  },
  water: {
    id: 'water', mode: 'water', label: 'Draw water', icon: 'droplet', saveable: true,
    params: [{ key: 'snap', label: 'Snap', kind: 'toggle', icon: 'magnet', quick: true }],
    create: (editor) => new WaterTool(editor),
    describe: (p) => `Draw water${p.snap === false ? ' · no snap' : ''}`,
  },
  build: {
    id: 'build', mode: 'build', label: 'Build', icon: 'building', saveable: true,
    params: [
      { key: 'kit', label: 'Kit', kind: 'kit' },
      {
        key: 'piece', label: 'Piece', kind: 'choice',
        options: (['foundation', 'wall', 'door', 'window', 'erase'] as const).map((v) => ({ value: v, label: pieceName(v), icon: v === 'erase' ? 'eraser' : v })),
      },
      { key: 'level', label: 'Level', kind: 'stepper', min: 0, max: MAX_LEVEL, step: 1, quick: true, saved: false },
    ],
    create: (editor) => new BuildingTool(editor),
    describe: (p, library) => `${library?.kits.get(String(p.kit))?.name ?? 'Building'} · ${pieceName(p.piece as ToolParams['build']['piece'])}`,
  },
}

export const MODE_TOOLS: Record<Mode, ToolId[]> = {
  select: ['select'], props: ['place'], terrain: ['sculpt', 'paint'], water: ['water'], build: ['build'],
}

/** The registry id of a tool instance (the select tool for anything unknown). */
export function idOf(tool: Tool): ToolId {
  return tool.name in TOOLS ? (tool.name as ToolId) : 'select'
}

/** The tool in hand, or null when only selecting. */
export function inHand(editor: Editor): ParamTool | null {
  const id = idOf(editor.tool)
  return id === 'select' ? null : id
}

/** Picks up a tool, first applying `patch` to its parameters. Already in hand: just updates
 *  its parameters. Returns false if the tool can't be created (e.g. no prop chosen). */
export function pickUp<T extends ParamTool>(editor: Editor, id: T, patch: Partial<ToolParams[T]> = {}): boolean {
  if (Object.keys(patch).length) setParams(id, patch)
  if (inHand(editor) === id) return true
  editor.selection.clear()
  const tool = TOOLS[id].create(editor)
  if (!tool) return false
  editor.setTool(tool)
  return true
}

/** Puts the tool down (back to selecting). */
export function putDown(editor: Editor) {
  if (inHand(editor)) editor.setTool(editor.defaultTool())
}

/** Whether a parameter applies for the tool's current values. */
export function applies(def: ParamDef, tool: ParamTool, library: Library): boolean {
  return def.applies ? def.applies(params[tool] as unknown as Record<string, unknown>, library) : true
}
