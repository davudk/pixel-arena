// Liquid types for water bodies (the `liquid` property of a water object; absent = 'water', so
// older maps open unchanged). Each is a set of uniforms for the shared water shader (water.ts):
// shallow / deep colors, foam at the shore and on wave crests, opacity range, glow, how fast and
// how much the surface moves, and the liquid's own surface detail (`look`: water caustics, lava
// crust and cracks, acid bubbles, ice cracks, swamp algae and lily pads, tar sheen, drifting silt).

export interface LiquidDef {
  id: string
  name: string
  shallow: string
  deep: string
  foam: string
  /** Opacity at the shore and at full depth (1 = opaque). */
  opacity: [number, number]
  /** Depth (m) at which the deep color is reached. */
  depthScale: number
  /** Self-lit amount at night (lava, acid); a third of it by day. */
  glow: number
  /** Surface detail drawn by the shader (see water.ts). */
  look: 'water' | 'lava' | 'acid' | 'ice' | 'swamp' | 'tar' | 'silt'
  /** Surface animation speed (0 = still, e.g. ice). */
  flow: number
  /** How much crest / sparkle pattern shows (0-1). */
  sparkle: number
  /** Shoreline foam width (m). */
  edge: number
}

export const LIQUIDS: LiquidDef[] = [
  { id: 'water', name: 'Water', shallow: '#3aa3bf', deep: '#0b3a66', foam: '#d9f2ff', opacity: [0.32, 0.9], depthScale: 2.5, glow: 0, look: 'water', flow: 1, sparkle: 0.6, edge: 0.35 },
  { id: 'ocean', name: 'Ocean', shallow: '#2c97c4', deep: '#06275a', foam: '#f2fbff', opacity: [0.4, 0.95], depthScale: 4, glow: 0, look: 'water', flow: 1.3, sparkle: 0.75, edge: 0.5 },
  { id: 'muddy', name: 'Muddy water', shallow: '#8f7344', deep: '#4a3520', foam: '#cdb98d', opacity: [0.7, 0.97], depthScale: 1.5, glow: 0, look: 'silt', flow: 0.6, sparkle: 0.25, edge: 0.3 },
  { id: 'swamp', name: 'Swamp', shallow: '#66733a', deep: '#26331a', foam: '#9aae5c', opacity: [0.78, 0.96], depthScale: 1.5, glow: 0, look: 'swamp', flow: 0.25, sparkle: 0.15, edge: 0.45 },
  { id: 'acid', name: 'Acid', shallow: '#8fd63a', deep: '#2f6e14', foam: '#e4ffb0', opacity: [0.75, 0.94], depthScale: 2, glow: 0.6, look: 'acid', flow: 1.2, sparkle: 0.4, edge: 0.3 },
  { id: 'lava', name: 'Lava', shallow: '#ffb02e', deep: '#c2300c', foam: '#3a2218', opacity: [1, 1], depthScale: 1.2, glow: 1.4, look: 'lava', flow: 0.25, sparkle: 0, edge: 0.4 },
  { id: 'ice', name: 'Ice', shallow: '#d6f1f8', deep: '#8fc3db', foam: '#ffffff', opacity: [0.92, 0.98], depthScale: 3, glow: 0, look: 'ice', flow: 0, sparkle: 0.3, edge: 0.3 },
  { id: 'tar', name: 'Tar', shallow: '#2e2924', deep: '#0d0c0b', foam: '#1a1714', opacity: [1, 1], depthScale: 1, glow: 0, look: 'tar', flow: 0.12, sparkle: 0, edge: 0.15 },
]

const BY_ID = new Map(LIQUIDS.map((l) => [l.id, l]))

export function liquid(id: unknown): LiquidDef {
  return BY_ID.get(String(id ?? 'water')) ?? LIQUIDS[0]
}
