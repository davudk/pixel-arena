// The ground grid, drawn crisp at output resolution after the filter pass, so pixel size,
// palettes, dither, oil paint etc. never blur or recolor it.
//
// Ground and terrain meshes each carry a child "grid mesh" on GRID_LAYER (same geometry, grid
// shader). After the post pass, PixelPass renders only that layer straight into the output,
// with a camera matching the displayed (sub-texel shifted) low-res image. A grid fragment is
// kept only where the low-res depth at that spot is the grid surface itself, so props,
// buildings and terrain in front still hide it, with edges on the same texels as the image.

import * as THREE from 'three'

export const GRID_LAYER = 1

/** Shared by every grid material; PixelPass sets them before each overlay render. */
export const gridUniforms = {
  tDepth: { value: null as THREE.Texture | null },
  pixelSize: { value: 1 }, // output pixels per low-res texel
  offset: { value: new THREE.Vector2() }, // sub-texel camera remainder (texels)
  margin: { value: 0 }, // low-res margin (texels)
  near: { value: 0.5 },
  far: { value: 1000 },
  lineWidth: { value: 1 }, // output pixels
  /** Building cells (kit cell size, m) drawn stronger while building; 0: off. */
  cellSize: { value: 0 },
}

const VERT = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}`

const FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform float pixelSize;
uniform vec2 offset;
uniform float margin;
uniform float near;
uniform float far;
uniform float lineWidth;
uniform float cellSize;
varying vec3 vWorld;
varying float vDepth;
#ifdef HOLES
uniform sampler2D uHoles;
uniform vec2 uHoleOrigin;
#endif

// 1 inside a line of lineWidth output pixels at every multiple of s meters, anti-aliased.
float gridLine(vec2 p, float s) {
  vec2 q = p / s;
  vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
  return 1.0 - clamp(min(d.x, d.y) - 0.5 * lineWidth + 0.5, 0.0, 1.0);
}

void main() {
#ifdef HOLES
  ivec2 chunk = ivec2(floor(vWorld.xz / CHUNK)) - ivec2(uHoleOrigin);
  if (all(greaterThanEqual(chunk, ivec2(0))) && all(lessThan(chunk, ivec2(MASK))) && texelFetch(uHoles, chunk, 0).r > 0.5) discard;
#endif
  // Same texel the post pass shows at this output pixel.
  vec2 src = gl_FragCoord.xy / pixelSize + vec2(margin) + vec2(-offset.x, offset.y);
  float scene = near + texelFetch(tDepth, ivec2(floor(src)), 0).r * (far - near);
  // A texel spans this much depth on this surface; anything further off is another surface.
  float tol = fwidth(vDepth) * pixelSize * 1.5 + 0.02;
  if (abs(vDepth - scene) > tol) discard;
  float pxPerM = 1.0 / max(max(fwidth(vWorld.x), fwidth(vWorld.z)), 1e-5) / lineWidth;
  // 1 m lines when zoomed in; major lines every 24 m (a multiple of 1, 2, 3, 4, 6 and 8 m, so
  // building cells, brush sizes and grid props all meet them); building cells while building.
  float a = max(gridLine(vWorld.xz, 1.0) * 0.16 * smoothstep(4.0, 8.0, pxPerM), gridLine(vWorld.xz, 24.0) * 0.45);
  if (cellSize > 0.0) a = max(a, gridLine(vWorld.xz, cellSize) * 0.32 * smoothstep(1.0, 2.5, pxPerM));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`

function material(defines: Record<string, string | number> = {}, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, defines,
    uniforms: { ...gridUniforms, ...extra },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  })
}

let terrainGrid: THREE.ShaderMaterial | null = null

/** Adds the grid child to a terrain chunk mesh (call `syncGrid` after replacing its geometry). */
export function addTerrainGrid(mesh: THREE.Mesh) {
  terrainGrid ??= material()
  attach(mesh, terrainGrid)
}

/** Adds the grid child to the ground plane, honoring its chunk holes. */
export function addGroundGrid(mesh: THREE.Mesh, chunk: number, mask: number, holes: Record<string, THREE.IUniform>) {
  attach(mesh, material({ HOLES: 1, CHUNK: `${chunk}.0`, MASK: mask }, holes))
}

/** Points the grid child at the mesh's current geometry. */
export function syncGrid(mesh: THREE.Mesh) {
  const grid = mesh.userData.grid as THREE.Mesh | undefined
  if (grid) grid.geometry = mesh.geometry
}

function attach(mesh: THREE.Mesh, mat: THREE.ShaderMaterial) {
  const grid = new THREE.Mesh(mesh.geometry, mat)
  grid.layers.set(GRID_LAYER) // never drawn by the scene cameras (layer 0)
  grid.frustumCulled = mesh.frustumCulled
  grid.renderOrder = 1
  mesh.add(grid)
  mesh.userData.grid = grid
}
