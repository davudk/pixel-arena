import { snapping, Vec2, Vec3 } from '@pixel-arena/core'

// Prop library: the same pack manifests the Godot version reads (packs/<pack>/pack.json +
// props/*.json), validated the same way, with category / theme / text search.

export type Mode = 'grid' | 'subgrid' | 'free'

export interface PropDef {
  id: string // "pack:local"
  localId: string
  packId: string
  name: string
  category: string
  themes: string[]
  tags: string[]
  modelUrl: string
  scale: number
  footprint: [number, number]
  height: number
  mode: Mode
  step: number
  align: 'ground' | 'surface' | 'wall'
  rotateSnapDeg: number
  autoplay: string
  light: { color?: string; energy?: number; range?: number } | null
  materialOverrides: Record<string, unknown>
  attribution: Record<string, string>
  searchText: string
}

/** Modular building kit (packs/<pack>/kits/*.json); see KitDef in the Godot build. */
export interface KitDef {
  id: string // "pack:local"
  name: string
  themes: string[]
  cellSize: number
  wallHeight: number
  pieces: Partial<Record<'wall' | 'window' | 'door' | 'floor', string>>
  colors: { roof: string; gable: string; foundation: string }
}

export interface Pack {
  id: string
  name: string
  version: string
  scale: number
  attribution: Record<string, string>
  props: PropDef[]
}

const ID = /^[a-z0-9_-]+$/
const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']

export class Library {
  packs = new Map<string, Pack>()
  props = new Map<string, PropDef>()
  kits = new Map<string, KitDef>()
  errors: string[] = []

  static async load(base = '/packs'): Promise<Library> {
    const lib = new Library()
    const index: { dir: string; props: string[]; kits: string[] }[] = await (await fetch(`${base}/index.json`)).json()
    for (const entry of index.sort((a, b) => a.dir.localeCompare(b.dir))) {
      const root = `${base}/${entry.dir}`
      const meta = await (await fetch(`${root}/pack.json`)).json()
      if (!ID.test(meta.id ?? '')) {
        lib.errors.push(`${entry.dir}: invalid pack id`)
        continue
      }
      const pack: Pack = {
        id: meta.id, name: meta.name ?? meta.id, version: meta.version ?? '', scale: meta.scale ?? 1,
        attribution: meta.attribution ?? {}, props: [],
      }
      const seen = new Set<string>()
      for (const file of entry.props.sort()) {
        const data = await (await fetch(`${root}/props/${file}`)).json()
        for (const d of Array.isArray(data) ? data : [data]) {
          const p = parseProp(d, pack, root, meta.materials ?? {}, lib.errors)
          if (!p || seen.has(p.localId)) continue
          seen.add(p.localId)
          pack.props.push(p)
          lib.props.set(p.id, p)
        }
      }
      for (const file of entry.kits ?? []) {
        const k = await (await fetch(`${root}/kits/${file}`)).json()
        if (!ID.test(k.id ?? '') || !k.pieces?.wall) {
          lib.errors.push(`${pack.id}/kits/${file}: invalid kit`)
          continue
        }
        const kit: KitDef = {
          id: `${pack.id}:${k.id}`, name: k.name ?? k.id, themes: k.themes ?? [],
          cellSize: k.cell_size ?? 3, wallHeight: k.wall_height ?? 3, pieces: k.pieces,
          colors: { roof: k.colors?.roof ?? '#3f9e8f', gable: k.colors?.gable ?? '#9a5b3e', foundation: k.colors?.foundation ?? '#8f8a84' },
        }
        lib.kits.set(kit.id, kit)
      }
      lib.packs.set(pack.id, pack)
    }
    return lib
  }

  categories(): Map<string, number> {
    const out = new Map<string, number>()
    for (const p of this.props.values()) {
      const parts = p.category.split('/')
      for (let i = 1; i <= parts.length; i++) {
        const path = parts.slice(0, i).join('/')
        out.set(path, (out.get(path) ?? 0) + 1)
      }
    }
    return new Map([...out].sort((a, b) => a[0].localeCompare(b[0])))
  }

  themes(): string[] {
    const set = new Set<string>()
    for (const p of this.props.values()) p.themes.forEach((t) => set.add(t))
    return [...set].sort()
  }

  search(query = '', theme = '', category = ''): PropDef[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const out: PropDef[] = []
    for (const p of this.props.values()) {
      if (theme && !p.themes.includes(theme)) continue
      if (category && p.category !== category && !p.category.startsWith(category + '/')) continue
      if (words.every((w) => p.searchText.includes(w))) out.push(p)
    }
    return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  }
}

function parseProp(d: any, pack: Pack, root: string, materials: Record<string, unknown>, errors: string[]): PropDef | null {
  const where = `${pack.id}:${d?.id ?? '?'}`
  if (!ID.test(d?.id ?? '')) return void errors.push(`${where}: invalid id`), null
  if (!d.category) return void errors.push(`${where}: missing category`), null
  if (!d.model) return void errors.push(`${where}: missing model`), null
  const attribution = { ...pack.attribution, ...(d.attribution ?? {}) }
  if (!ALLOWED_LICENSES.includes(attribution.license)) return void errors.push(`${where}: license not allowed`), null
  const placement = d.placement ?? {}
  const p: PropDef = {
    id: `${pack.id}:${d.id}`,
    localId: d.id,
    packId: pack.id,
    name: d.name ?? d.id,
    category: d.category,
    themes: d.themes ?? [],
    tags: d.tags ?? [],
    modelUrl: `${root}/${d.model}`,
    scale: d.scale ?? pack.scale,
    footprint: d.footprint ?? [1, 1],
    height: d.height ?? 1,
    mode: placement.mode ?? 'subgrid',
    step: placement.step ?? 0.5,
    align: placement.align ?? 'ground',
    rotateSnapDeg: placement.rotate_snap_deg ?? 15,
    autoplay: d.animations?.autoplay ?? '',
    light: d.light ?? null,
    materialOverrides: materials,
    attribution,
    searchText: '',
  }
  p.searchText = [p.name, p.localId, p.category, ...p.themes, ...p.tags, pack.name].join(' ').toLowerCase()
  return p
}

// --- Snapping (rules live in @pixel-arena/core) ---------------------------------------------

/** Snapped (x, z) for placing `p` at a point; `free` disables snapping. */
export function snapProp(p: PropDef, x: number, z: number, yaw: number, free: boolean): [number, number] {
  if (free || p.mode === 'free') return [x, z]
  const fp = snapping.footprintAt(new Vec2(p.footprint[0], p.footprint[1]), yaw, (a, b) => new Vec2(a, b))
  const s = snapping.snapPosition(new Vec3(x, 0, z), p.mode, p.step, fp)
  return [s.x, s.z]
}
