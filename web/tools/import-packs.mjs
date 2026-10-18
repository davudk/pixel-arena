#!/usr/bin/env node
// Imports downloaded third-party model packs into packs/<id>/ (see packs.config.mjs for which
// packs, their scales, categories and placement). For every model it:
//   - measures the bounds from the glTF itself (accessor min/max through the node transforms);
//   - re-centers it: a new root node puts the footprint's center at the origin and the bottom at
//     y = 0 (snapping and selection rings assume that), without touching the geometry;
//   - copies it (GLB, or .gltf with its .bin and textures) under a URL-safe file name;
//   - writes a props/<group>.json entry: id, name, category, themes, footprint and height in
//     meters (after the pack scale), placement.
// Plus pack.json (attribution) and LICENSE.txt. No dependencies.
//
//   node web/tools/import-packs.mjs <downloads dir> [pack id ...]
//
// <downloads dir> holds one unzipped folder per source pack (names in packs.config.mjs).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKS } from './packs.config.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = path.resolve(here, '../../packs')

const [srcRoot, ...only] = process.argv.slice(2)
if (!srcRoot) {
  console.error('usage: node web/tools/import-packs.mjs <downloads dir> [pack id ...]')
  process.exit(1)
}


function importPack(pack) {
  const src = path.join(srcRoot, pack.source)
  if (!fs.existsSync(src)) {
    console.warn(`skip ${pack.id}: ${src} not found`)
    return
  }
  const out = path.join(PACKS_DIR, pack.id)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(path.join(out, 'models'), { recursive: true })
  fs.mkdirSync(path.join(out, 'props'), { recursive: true })

  const files = walk(src).filter((f) => /\.(glb|gltf)$/i.test(f) && pack.models.test(path.relative(src, f)))
  const groups = new Map()
  const used = new Set()
  let count = 0
  for (const file of files.sort()) {
    const rel = path.relative(src, file)
    const base = path.basename(file).replace(/\.(glb|gltf)$/i, '')
    if (pack.exclude?.test(base) || pack.exclude?.test(rel)) continue
    let slug = slugify(pack.slug ? pack.slug(base, rel) : base)
    for (let n = 2; used.has(slug); n++) slug = `${slugify(base)}-${n}`
    used.add(slug)

    const { json, bin } = readGltf(file)
    const box = bounds(json)
    if (!box) {
      console.warn(`  ${pack.id}: no geometry in ${rel}`)
      continue
    }
    const center = [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2]
    recenter(json, center.map((v) => -v))
    const ext = file.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf'
    const modelPath = `models/${slug}.${ext}`
    if (ext === 'glb') writeGlb(path.join(out, modelPath), json, bin)
    else writeGltf(path.join(out, 'models'), slug, json, path.dirname(file))

    const scale = pack.scale
    const size = [0, 1, 2].map((i) => (box.max[i] - box.min[i]) * scale)
    const category = pack.category(base, rel)
    if (!category) continue
    const entry = {
      id: slug.replace(/-/g, '_'),
      name: pack.name_of ? pack.name_of(base, rel) : nameOf(base),
      category,
      themes: pack.themes(category, base),
      tags: pack.tags ? pack.tags(base, rel) : [],
      model: modelPath,
      footprint: [round(Math.max(size[0], 0.05)), round(Math.max(size[2], 0.05))],
      height: round(Math.max(size[1], 0.02)),
      placement: pack.placement(category, base, size),
    }
    const group = category.split('/')[0]
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
    count++
  }

  // Shared texture folders (Kenney GLBs reference Textures/*.png next to the model).
  for (const dir of pack.textureDirs ?? []) {
    const from = path.join(src, dir)
    if (fs.existsSync(from)) fs.cpSync(from, path.join(out, 'models', path.basename(dir)), { recursive: true })
  }
  for (const [group, entries] of groups) {
    entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    fs.writeFileSync(path.join(out, 'props', `${group}.json`), JSON.stringify(entries, null, '\t') + '\n')
  }
  const meta = {
    id: pack.id, name: pack.title, version: pack.version, scale: pack.scale,
    attribution: { author: pack.author, source_url: pack.url, license: pack.license, license_url: LICENSE_URLS[pack.license] },
    ...(pack.materials ? { materials: pack.materials } : {}),
  }
  fs.writeFileSync(path.join(out, 'pack.json'), JSON.stringify(meta, null, '\t') + '\n')
  const license = pack.licenseFile && path.join(src, pack.licenseFile)
  fs.writeFileSync(path.join(out, 'LICENSE.txt'),
    license && fs.existsSync(license) ? fs.readFileSync(license)
      : `${pack.title} by ${pack.author}\n${pack.url}\n\nLicense: ${pack.license} (${LICENSE_URLS[pack.license]})\n`)
  console.log(`${pack.id}: ${count} props in ${groups.size} files`)
}

const LICENSE_URLS = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
}

// --- glTF ------------------------------------------------------------------------------------

function readGltf(file) {
  const buf = fs.readFileSync(file)
  if (file.toLowerCase().endsWith('.gltf')) return { json: JSON.parse(buf.toString('utf8')), bin: null }
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`)
  let off = 12
  let json = null
  let bin = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    const chunk = buf.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
    else if (type === 0x004e4942) bin = chunk
    off += 8 + len
  }
  return { json, bin }
}

function writeGlb(file, json, bin) {
  const pad = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b)
  const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const chunks = [chunkHeader(j.length, 0x4e4f534a), j]
  if (bin) {
    const b = pad(Buffer.from(bin), 0)
    chunks.push(chunkHeader(b.length, 0x004e4942), b)
  }
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + body.length, 8)
  fs.writeFileSync(file, Buffer.concat([header, body]))
}

function chunkHeader(len, type) {
  const h = Buffer.alloc(8)
  h.writeUInt32LE(len, 0)
  h.writeUInt32LE(type, 4)
  return h
}

/** .gltf with its buffers and images copied next to it (shared images are copied once). */
function writeGltf(dir, slug, json, srcDir) {
  for (const [i, b] of (json.buffers ?? []).entries()) {
    if (!b.uri || b.uri.startsWith('data:')) continue
    const name = `${slug}${i ? `-${i}` : ''}.bin`
    fs.copyFileSync(path.join(srcDir, decodeURIComponent(b.uri)), path.join(dir, name))
    b.uri = name
  }
  for (const img of json.images ?? []) {
    if (!img.uri || img.uri.startsWith('data:')) continue
    const name = slugify(path.basename(decodeURIComponent(img.uri)).replace(/\.[^.]+$/, '')) + path.extname(img.uri).toLowerCase()
    const to = path.join(dir, name)
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(srcDir, decodeURIComponent(img.uri)), to)
    img.uri = name
  }
  fs.writeFileSync(path.join(dir, `${slug}.gltf`), JSON.stringify(json))
}

/** Wraps the default scene's roots in one node moved by `t`. */
function recenter(json, t) {
  const scene = json.scenes[json.scene ?? 0]
  json.nodes ??= []
  const root = json.nodes.length
  json.nodes.push({ name: 'pixel-arena-origin', translation: t, children: scene.nodes })
  scene.nodes = [root]
}

/** World-space bounds of the default scene's meshes (positions' min/max boxes, transformed). */
function bounds(json) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const visit = (index, parent) => {
    const node = json.nodes[index]
    const m = mul(parent, local(node))
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const acc = json.accessors[prim.attributes?.POSITION]
        if (!acc?.min || !acc?.max) continue
        for (let c = 0; c < 8; c++) {
          const p = [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]]
          const w = apply(m, p)
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], w[i])
            max[i] = Math.max(max[i], w[i])
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, m)
  }
  for (const n of json.scenes[json.scene ?? 0].nodes) visit(n, IDENTITY)
  return Number.isFinite(min[0]) ? { min, max } : null
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Column-major 4x4 from a node's matrix or TRS. */
function local(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function mul(a, b) {
  const o = new Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return o
}

function apply(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
}

// --- Helpers ---------------------------------------------------------------------------------

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function slugify(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** "kitchenFridgeLarge" / "bed_double_A" / "Bed King" -> "Kitchen Fridge Large" / "Bed Double A"
 *  (title case, like the existing packs' prop names). */
export function nameOf(base) {
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function round(v) {
  return Math.round(v * 100) / 100
}

// Run (after the constants above are initialized).
for (const pack of PACKS) {
  if (only.length && !only.includes(pack.id)) continue
  importPack(pack)
}
