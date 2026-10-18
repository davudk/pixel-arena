// Shared terrain look: per-slot materials (textures from a pack, or flat colors with a 4 m
// checker). (The 1 m / 32 m grid is a separate
// overlay drawn after the filters, see grid.ts.) Injected into MeshLambertMaterial so the
// ground and terrain chunks keep standard lighting and shadows.

import * as THREE from 'three'
import { Signal } from '@pixel-arena/core'

/** A terrain material: what the catalogue shows and the shader draws for one slot. */
export interface TerrainMaterial {
  name: string
  /** Flat color (the texture's average once loaded): swatches, outlines, untextured fallback. */
  color: string
  group: string
  /** Seamless texture (URL) repeated every `scale` meters; none: the flat color. */
  texture?: string
  scale?: number
}

/** Terrain materials by slot (the value stored per cell; 0 = untouched land). Built-in flat
 *  colors until a pack's textures load (loadTerrainMaterials); slots never change meaning. */
export const PALETTE: TerrainMaterial[] = [
  { name: 'Grass', color: '#5a8c45', group: 'Ground' },
  { name: 'Dirt', color: '#8a6844', group: 'Ground' },
  { name: 'Sand', color: '#d9c48c', group: 'Ground' },
  { name: 'Rock', color: '#8a8580', group: 'Ground' },
  { name: 'Snow', color: '#eef2f5', group: 'Ground' },
  { name: 'Dark grass', color: '#3f6e36', group: 'Ground' },
  { name: 'Mud', color: '#5e4a36', group: 'Ground' },
  { name: 'Gravel', color: '#a39d92', group: 'Ground' },
]
/** Steep slopes blend toward this material. */
export const CLIFF = 3
/** Texture size every material texture is drawn at (the layers of one array texture). */
const TEX = 128

/** Shared by every terrain material, so loading textures updates all of them. */
const terrainUniforms = {
  uPalette: { value: null as THREE.DataTexture | null },
  uTerrainTex: { value: new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1) },
}

/** The palette as an N x 2 texture, sampled with texelFetch. Row 0: linear RGB, and in alpha
 *  the texture scale (m x 16; 0: no texture). Row 1, red: 1 for a hard-edged (built) material. */
function buildPalette() {
  const n = Math.max(1, PALETTE.length)
  const data = new Uint8Array(n * 4 * 2)
  PALETTE.forEach((m, i) => {
    if (!m) return
    const c = new THREE.Color(m.color) // converted to linear working space
    const scale = m.texture && m.scale ? Math.round(m.scale * 16) : 0
    data.set([c.r * 255, c.g * 255, c.b * 255, scale], i * 4)
    data.set([hardEdged(m) ? 255 : 0, 0, 0, 255], (n + i) * 4)
  })
  terrainUniforms.uPalette.value?.dispose()
  const tex = new THREE.DataTexture(data, n, 2)
  tex.needsUpdate = true
  terrainUniforms.uPalette.value = tex
}
buildPalette()

/** Built surfaces (paving, tiles, brick, wood) keep crisp 1 m cell edges; ground materials
 *  blend into their neighbours. */
export function hardEdged(m: TerrainMaterial): boolean {
  return m.group !== 'Ground'
}

/** Materials picked from the catalogue changed (textures loaded). */
export const terrainMaterialsChanged = new Signal<void>()

/** Takes the library's terrain materials (by slot): loads their textures into one array texture
 *  (layer = slot, mipmapped) and replaces the palette entries, each with its texture's average
 *  color. Slots without a material keep their built-in color. */
export async function loadTerrainMaterials(defs: Map<number, { slot: number; name: string; group: string; url: string; scale: number }>) {
  if (!defs.size) return
  const depth = Math.max(PALETTE.length, ...[...defs.keys()].map((k) => k + 1))
  const data = new Uint8Array(TEX * TEX * 4 * depth)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEX
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  await Promise.all([...defs.values()].map(async (d) => {
    const img = new Image()
    img.src = d.url
    try {
      await img.decode()
    } catch {
      return
    }
    // One at a time on the shared canvas (decode above is the slow part).
    ctx.clearRect(0, 0, TEX, TEX)
    ctx.drawImage(img, 0, 0, TEX, TEX)
    const px = ctx.getImageData(0, 0, TEX, TEX).data
    data.set(px, d.slot * TEX * TEX * 4)
    let r = 0, g = 0, b = 0
    for (let i = 0; i < px.length; i += 4) {
      r += px[i]
      g += px[i + 1]
      b += px[i + 2]
    }
    const n = px.length / 4
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
    PALETTE[d.slot] = { name: d.name, group: d.group, color: `#${hex(r)}${hex(g)}${hex(b)}`, texture: d.url, scale: d.scale }
  }))
  for (let i = 0; i < depth; i++) PALETTE[i] ??= { name: `Material ${i}`, color: '#808080', group: 'Ground' }
  const tex = new THREE.DataArrayTexture(data, TEX, TEX, depth)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  terrainUniforms.uTerrainTex.value.dispose()
  terrainUniforms.uTerrainTex.value = tex
  buildPalette()
  terrainMaterialsChanged.emit()
}

/** Whether the grid overlay is drawn (render/grid.ts); read by PixelPass. */
export const showGrid = { value: true }

const COMMON = /* glsl */ `
varying vec3 vWorld;
uniform sampler2D uPalette;
uniform highp sampler2DArray uTerrainTex;
vec3 applyChecker(vec3 c, vec2 xz) { vec2 c4 = floor(xz / 4.0); return c * mix(1.0, 0.92, mod(c4.x + c4.y, 2.0)); }
// Material i at world xz: its texture (repeated every scale m; mip level from the screen-space
// derivatives taken outside any branch, a level sharper than the default so patterns read in
// the low-res pass) or, untextured, its flat color with a 4 m checker.
vec3 materialColor(int i, vec2 xz, vec2 dx, vec2 dy) {
  vec4 p = texelFetch(uPalette, ivec2(i, 0), 0);
  if (p.a < 0.5 / 255.0) return applyChecker(p.rgb, xz);
  float s = p.a * 255.0 / 16.0;
  return textureGrad(uTerrainTex, vec3(xz / s, float(i)), dx * 0.5 / s, dy * 0.5 / s).rgb;
}
bool hardEdged(int i) { return texelFetch(uPalette, ivec2(i, 1), 0).r > 0.5; }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

/** Lambert material whose base color comes from `colorGlsl` (sets `vec3 base`), with checker
 *  and grid applied after. `extraUniforms` are added to the shader. */
export function terrainMaterial(extraDecls: string, colorGlsl: string, extraUniforms: Record<string, THREE.IUniform>): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  // three.js caches programs by onBeforeCompile's source text, which is the same closure for
  // every variant here; key on the injected code so ground and chunks get their own programs.
  const variant = extraDecls + colorGlsl
  mat.customProgramCacheKey = () => `terrain:${variant}`
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, terrainUniforms, extraUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vWorldNormal;\n${extraDecls}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 base;
vec2 dxz = dFdx(vWorld.xz), dyz = dFdy(vWorld.xz);
${colorGlsl}
diffuseColor.rgb = base;`)
  }
  return mat
}
