// Water bodies: a flat polygon (relative to the object's position, surface at position.y) with a
// stylized shader: shallow-to-deep color, shoreline foam, drifting sparkles. The look comes from
// the object's liquid (liquids.ts: water, lava, acid, ...) as uniforms, so every liquid shares one
// shader program. Depth comes from the terrain heightfield under the polygon (sampled into a small
// texture), so it's independent of the view and needs no depth-buffer read.

import * as THREE from 'three'
import { liquid } from './liquids'
import { terrainEdit, type MapDocument, type MapObject, type PackedVec2Array, type Vec3 } from '@pixel-arena/core'

export const waterTime = { value: 0 }

const FRAG = /* glsl */ `
uniform sampler2D uHeights;
uniform vec4 uHeightRect; // world x0, z0, size x, size z (texels at integer meters)
uniform float uLevel;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec2 uOpacity;
uniform float uDepthScale;
uniform float uGlow;
uniform float uFlow;
uniform float uSparkle;
uniform float uEdge;
varying vec3 vWorld;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float groundAt(vec2 xz) {
  vec2 t = clamp(xz - uHeightRect.xy, vec2(0.0), uHeightRect.zw - 1.001);
  ivec2 i = ivec2(floor(t));
  vec2 f = fract(t);
  float a = texelFetch(uHeights, i, 0).r, b = texelFetch(uHeights, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeights, i + ivec2(0, 1), 0).r, d = texelFetch(uHeights, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`

export function buildWater(obj: MapObject, doc: MapDocument): THREE.Mesh | null {
  const polygon = obj.props.get('polygon') as PackedVec2Array | null
  if (!polygon || polygon.points.length < 3) return null
  const shape = new THREE.Shape(polygon.points.map((p) => new THREE.Vector2(p.x, p.y)))
  // Shape is in XY; rotate so local y becomes +z (matching the Godot polygon's (x, z)).
  const geometry = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2)
  const pos = obj.props.get('position') as Vec3
  const yaw = Number(obj.props.get('rotation') ?? 0)

  // World-space bounds of the rotated polygon -> heights texture at 1 m spacing.
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const world = polygon.points.map((p) => [pos.x + p.x * cos + p.y * sin, pos.z - p.x * sin + p.y * cos])
  const x0 = Math.floor(Math.min(...world.map((w) => w[0]))) - 1
  const z0 = Math.floor(Math.min(...world.map((w) => w[1]))) - 1
  const w = Math.ceil(Math.max(...world.map((p) => p[0]))) + 2 - x0
  const h = Math.ceil(Math.max(...world.map((p) => p[1]))) + 2 - z0
  const data = new Float32Array(w * h)
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) data[z * w + x] = terrainEdit.heightAt(doc, x0 + x, z0 + z)
  const heights = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType)
  heights.needsUpdate = true

  const l = liquid(obj.props.get('liquid'))
  const opaque = l.opacity[0] >= 1
  // Polygon offset: a surface flush with the ground (no basin) would otherwise z-fight with it.
  const mat = new THREE.MeshLambertMaterial({
    color: '#ffffff', transparent: !opaque, side: THREE.DoubleSide, depthWrite: opaque,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  })
  const color = (hex: string) => new THREE.Color(hex) // linear working space, like the scene
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uHeights: { value: heights }, uHeightRect: { value: new THREE.Vector4(x0, z0, w, h) },
      uLevel: { value: pos.y }, uTime: waterTime,
      uShallow: { value: color(l.shallow) }, uDeep: { value: color(l.deep) }, uFoam: { value: color(l.foam) },
      uOpacity: { value: new THREE.Vector2(...l.opacity) }, uDepthScale: { value: l.depthScale },
      uGlow: { value: l.glow }, uFlow: { value: l.flow }, uSparkle: { value: l.sparkle }, uEdge: { value: l.edge },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float depth = max(uLevel - groundAt(vWorld.xz), 0.0);
float dd = clamp(depth / uDepthScale, 0.0, 1.0);
vec3 col = mix(uShallow, uDeep, dd);
float t = uTime * uFlow;
float band = sin(vWorld.x * 0.7 + vWorld.z * 0.4 + t * 0.8) * sin(vWorld.z * 0.9 - t * 0.5);
col = mix(col, uFoam, step(0.93, band) * step(0.5, hash12(floor(vWorld.xz * 3.0))) * uSparkle);
float edge = 1.0 - smoothstep(0.0, uEdge, depth);
col = mix(col, uFoam, step(0.55, edge + hash12(floor(vWorld.xz * 4.0)) * 0.3) * 0.85);
diffuseColor = vec4(col, mix(uOpacity.x, uOpacity.y, dd));`)
      // Lava and acid light themselves.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += col * uGlow;')
  }
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.renderOrder = 1
  mesh.userData.dispose = () => heights.dispose()
  return mesh
}
