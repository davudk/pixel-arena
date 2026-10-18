// Shared terrain look (port of terrain_common.gdshaderinc): palette colors, 4 m checker, 1 m
// grid lines that fade when dense, 32 m chunk lines. Injected into MeshLambertMaterial so the
// ground and terrain chunks keep standard lighting and shadows.

import * as THREE from 'three'

/** Terrain materials by index (the value stored per cell). Index 0 = untouched land. */
export const PALETTE = [
  { name: 'Grass', color: '#5a8c45' },
  { name: 'Dirt', color: '#8a6844' },
  { name: 'Sand', color: '#d9c48c' },
  { name: 'Rock', color: '#8a8580' },
  { name: 'Snow', color: '#eef2f5' },
  { name: 'Dark grass', color: '#3f6e36' },
  { name: 'Mud', color: '#5e4a36' },
  { name: 'Gravel', color: '#a39d92' },
]
/** Steep slopes blend toward this material. */
export const CLIFF = 3

let paletteTexture: THREE.DataTexture | null = null

/** The palette as an N x 1 texture (linear RGB, sampled with texelFetch). */
export function paletteTex(): THREE.DataTexture {
  if (!paletteTexture) {
    const data = new Uint8Array(PALETTE.length * 4)
    PALETTE.forEach((m, i) => {
      const c = new THREE.Color(m.color) // converted to linear working space
      data.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4)
    })
    paletteTexture = new THREE.DataTexture(data, PALETTE.length, 1)
    paletteTexture.needsUpdate = true
  }
  return paletteTexture
}

export const showGrid = { value: true }

const COMMON = /* glsl */ `
varying vec3 vWorld;
uniform sampler2D uPalette;
uniform bool uShowGrid;
vec3 paletteColor(int i) { return texelFetch(uPalette, ivec2(i, 0), 0).rgb; }
vec3 applyChecker(vec3 c, vec2 xz) { vec2 c4 = floor(xz / 4.0); return c * mix(1.0, 0.92, mod(c4.x + c4.y, 2.0)); }
float gridLine(vec2 p, float s) {
  vec2 q = p / s;
  vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
  return 1.0 - clamp(min(d.x, d.y), 0.0, 1.0);
}
vec3 applyGrid(vec3 c, vec3 w) {
  if (!uShowGrid) return c;
  float pxPerM = 1.0 / max(max(fwidth(w.x), fwidth(w.z)), 1e-5);
  c = mix(c, vec3(1.0), gridLine(w.xz, 1.0) * 0.12 * smoothstep(3.0, 6.0, pxPerM));
  return mix(c, vec3(1.0), gridLine(w.xz, 32.0) * 0.5);
}
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
    Object.assign(shader.uniforms, { uPalette: { value: paletteTex() }, uShowGrid: showGrid, ...extraUniforms })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vWorldNormal;\n${extraDecls}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 base;
${colorGlsl}
diffuseColor.rgb = applyGrid(applyChecker(base, vWorld.xz), vWorld);`)
  }
  return mat
}
