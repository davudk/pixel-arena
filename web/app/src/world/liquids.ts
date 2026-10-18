// Liquid types for water bodies (the `liquid` property of a water object; absent = 'water', so
// older maps open unchanged). Each is a set of uniforms for the shared water shader (water.ts):
// shallow / deep colors, foam at the shore and on wave crests, opacity range, glow, and how fast
// and how much the surface moves.

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
  /** Self-lit amount (lava, acid). */
  glow: number
  /** Surface animation speed (0 = still, e.g. ice). */
  flow: number
  /** How much crest / sparkle pattern shows (0-1). */
  sparkle: number
  /** Shoreline foam width (m). */
  edge: number
}

export const LIQUIDS: LiquidDef[] = [
  { id: 'water', name: 'Water', shallow: '#2c91b5', deep: '#04173f', foam: '#d9f2ff', opacity: [0.55, 0.92], depthScale: 2.5, glow: 0, flow: 1, sparkle: 0.5, edge: 0.35 },
  { id: 'ocean', name: 'Ocean', shallow: '#1f86b8', deep: '#020f33', foam: '#f2fbff', opacity: [0.65, 0.97], depthScale: 4, glow: 0, flow: 1.3, sparkle: 0.7, edge: 0.5 },
  { id: 'muddy', name: 'Muddy water', shallow: '#8f7344', deep: '#3f2c17', foam: '#cdb98d', opacity: [0.8, 0.98], depthScale: 1.5, glow: 0, flow: 0.6, sparkle: 0.25, edge: 0.3 },
  { id: 'swamp', name: 'Swamp', shallow: '#5f6d2c', deep: '#1c2610', foam: '#9aae5c', opacity: [0.82, 0.97], depthScale: 1.5, glow: 0, flow: 0.25, sparkle: 0.15, edge: 0.45 },
  { id: 'acid', name: 'Acid', shallow: '#a8ff3c', deep: '#2b8a0c', foam: '#efffc0', opacity: [0.78, 0.95], depthScale: 2, glow: 0.55, flow: 1.4, sparkle: 0.6, edge: 0.3 },
  { id: 'lava', name: 'Lava', shallow: '#ffb02e', deep: '#b8240a', foam: '#ffe98a', opacity: [1, 1], depthScale: 1.2, glow: 1.1, flow: 0.25, sparkle: 0.45, edge: 0.4 },
  { id: 'ice', name: 'Ice', shallow: '#d6f1f8', deep: '#87bdd6', foam: '#ffffff', opacity: [0.9, 0.98], depthScale: 3, glow: 0, flow: 0, sparkle: 0.3, edge: 0.25 },
  { id: 'tar', name: 'Tar', shallow: '#2e2924', deep: '#0b0a09', foam: '#5b554c', opacity: [1, 1], depthScale: 1, glow: 0, flow: 0.12, sparkle: 0.35, edge: 0.15 },
]

const BY_ID = new Map(LIQUIDS.map((l) => [l.id, l]))

export function liquid(id: unknown): LiquidDef {
  return BY_ID.get(String(id ?? 'water')) ?? LIQUIDS[0]
}
