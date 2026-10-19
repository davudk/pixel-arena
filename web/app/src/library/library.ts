import { snapping, Vec2, Vec3, type Furnishing, type Value } from '@pixel-arena/core'

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

/** Piece roles a kit can fill. Edge kits put wall pieces on cell edges (wall, window, door,
 *  doorway; a door may be a doorway wall plus a door leaf, listed together) and fill cells with
 *  floor and stairs. Block kits put one solid piece per cell and storey, turned so its front
 *  faces out: block (no outside face), wall / window / door (one outside face of that kind),
 *  corner (two adjacent outside faces). */
export type KitRole = 'wall' | 'window' | 'door' | 'doorway' | 'floor' | 'stairs' | 'block' | 'corner'

/** Modular building kit (packs/<pack>/kits/*.json). */
export interface KitDef {
  id: string // "pack:local"
  name: string
  themes: string[]
  cellSize: number
  wallHeight: number
  /** edge: wall panels on cell edges (rooms and interiors). block: a solid piece per cell
   *  (exteriors only). */
  style: 'edge' | 'block'
  /** Edge kits: where a wall piece's origin is. cell: at the cell center with the panel on its
   *  +X edge (the Fantasy Town pieces). center: at the panel's own center (re-centered imports);
   *  the panel is moved onto the edge and turned to lie along it. */
  pivot: 'cell' | 'center'
  /** Block kits: the side of a piece that is its front (door, windows); a corner piece's second
   *  outside face is the side before the front going clockwise (front S: east). */
  front: 'N' | 'E' | 'S' | 'W'
  /** Stairs run this many cells (the floor above them is open over the whole run). */
  stairsCells: number
  pieces: Partial<Record<KitRole, string[]>>
  colors: { roof: string; gable: string; foundation: string }
}

/** A terrain material (packs/<pack>/terrain/*.json): a seamless texture repeated every `scale`
 *  meters. `slot` is the number stored per terrain cell in maps, so it never changes. */
export interface TerrainMaterialDef {
  slot: number
  id: string // "pack:local"
  name: string
  group: string
  url: string
  scale: number
  packId: string
}

/** A whole premade building (packs/<pack>/buildings/*.json, baked by web/tools/bake-premade.mjs):
 *  the building's properties and its furniture and yard, building-local. */
export interface PremadeDef {
  id: string // "pack:local"
  name: string
  category: string
  storeys: number
  /** The building's width and depth (m); bounds of everything around it [x0, z0, x1, z1]. */
  size: [number, number]
  bounds: [number, number, number, number]
  props: Record<string, Value>
  children: Furnishing[]
  packId: string
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
  /** Premade buildings, in pack and file order. */
  buildings = new Map<string, PremadeDef>()
  /** Terrain materials by slot (the first pack to claim a slot keeps it). */
  terrain = new Map<number, TerrainMaterialDef>()
  errors: string[] = []

  static async load(base = '/packs'): Promise<Library> {
    const lib = new Library()
    const index: { dir: string; props: string[]; kits: string[]; terrain?: string[]; buildings?: string[] }[] = await (await fetch(`${base}/index.json`)).json()
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
        // Pieces may be one prop id or a list (placed together); ids without a pack are this pack's.
        const pieces: KitDef['pieces'] = {}
        for (const [role, v] of Object.entries(k.pieces as Record<string, string | string[]>))
          pieces[role as KitRole] = (Array.isArray(v) ? v : [v]).map((id) => (id.includes(':') ? id : `${pack.id}:${id}`))
        const kit: KitDef = {
          id: `${pack.id}:${k.id}`, name: k.name ?? k.id, themes: k.themes ?? [],
          cellSize: k.cell_size ?? 3, wallHeight: k.wall_height ?? 3,
          style: k.style === 'block' ? 'block' : 'edge', pivot: k.pivot === 'center' ? 'center' : 'cell',
          front: (['N', 'E', 'S', 'W'] as const).includes(k.front) ? k.front : 'S', stairsCells: Math.max(1, Number(k.stairs_cells) || 1), pieces,
          colors: { roof: k.colors?.roof ?? '#3f9e8f', gable: k.colors?.gable ?? '#9a5b3e', foundation: k.colors?.foundation ?? '#8f8a84' },
        }
        lib.kits.set(kit.id, kit)
      }
      if (entry.terrain?.length && !ALLOWED_LICENSES.includes(pack.attribution.license)) lib.errors.push(`${pack.id}: terrain license not allowed`)
      else for (const file of entry.terrain ?? []) {
        const data = await (await fetch(`${root}/terrain/${file}`)).json()
        for (const t of Array.isArray(data) ? data : [data]) {
          const where = `${pack.id}/terrain/${file}:${t?.id ?? '?'}`
          const texture = String(t?.texture ?? '')
          if (!ID.test(t?.id ?? '') || !Number.isInteger(t.slot) || t.slot < 0 || t.slot > 255) lib.errors.push(`${where}: invalid material`)
          else if (!/^[a-z0-9_/-]+\.png$/.test(texture) || texture.includes('..')) lib.errors.push(`${where}: invalid texture path`)
          else if (lib.terrain.has(t.slot)) lib.errors.push(`${where}: slot ${t.slot} already used`)
          else lib.terrain.set(t.slot, {
            slot: t.slot, id: `${pack.id}:${t.id}`, name: t.name ?? t.id, group: t.group ?? 'Ground', url: `${root}/${texture}`,
            scale: Math.min(15, Math.max(0.5, Number(t.scale) || 2)), packId: pack.id,
          })
        }
      }
      for (const file of entry.buildings ?? []) {
        const data = await (await fetch(`${root}/buildings/${file}`)).json()
        for (const b of Array.isArray(data) ? data : [data]) {
          const where = `${pack.id}/buildings/${file}:${b?.id ?? '?'}`
          if (!ID.test(b?.id ?? '') || typeof b.props !== 'object' || !Array.isArray(b.children)) {
            lib.errors.push(`${where}: invalid building`)
            continue
          }
          const props: Record<string, Value> = {}
          for (const [k, v] of Object.entries(b.props)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v
          lib.buildings.set(`${pack.id}:${b.id}`, {
            id: `${pack.id}:${b.id}`, name: b.name ?? b.id, category: b.category ?? 'Buildings', storeys: Number(b.storeys) || 1,
            size: b.size ?? [10, 10], bounds: b.bounds ?? [0, 0, 10, 10], props, children: b.children, packId: pack.id,
          })
        }
      }
      lib.packs.set(pack.id, pack)
    }
    // A premade building's furniture must exist (packs load in name order, so check at the end).
    for (const [id, b] of lib.buildings) {
      const missing = b.children.find((c) => !lib.props.has(c.prop))
      if (missing) {
        lib.errors.push(`${id}: unknown prop ${missing.prop}`)
        lib.buildings.delete(id)
      }
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
