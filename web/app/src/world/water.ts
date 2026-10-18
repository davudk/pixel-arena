// Water bodies: a flat polygon with optional holes (relative to the object's position, surface at
// position.y) and a stylized, pixel-art shader. Every liquid shares one program; the object's
// liquid (liquids.ts) sets its uniforms. Depth comes from the terrain heightfield under the
// polygon (sampled into a small texture), so it's independent of the view and needs no
// depth-buffer read.
//
// The common surface: depth in four flat bands from shore to deep (dithered at the band edges),
// clear shallows with drifting caustics, a tint toward the sky's current color, sun glints on the
// wave crests (moonlit at night), and shore foam that laps in and out with a wave line running up
// the slope. Each liquid's `look` adds its own detail: lava is dark crust plates with glowing
// cracks; acid has popping bubbles; ice has cracks and a frosted rim; swamp has algae and lily
// pads; tar a slow sheen; muddy water drifting silt. Glow (lava, acid) is a third as strong by day
// as at night (render/day-cycle.ts waterEnv).
//
// A body can flow (`flow_speed`, `flow_dir`): its patterns then ride the current, with foam
// streaks stretched along it.

import * as THREE from 'three'
import { waterEnv } from '../render/day-cycle'
import { liquid } from './liquids'
import { PackedVec2Array, terrainEdit, type MapDocument, type MapObject, type Vec3 } from '@pixel-arena/core'

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
uniform vec2 uFlowVel; // world x / z, m/s (0: still)
uniform int uLook;
uniform float uDay;
uniform vec3 uSky;
uniform vec3 uSunDir;
varying vec3 vWorld;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
// Cells around p: distance to the nearest point, distance to the cell edge (F2 - F1), cell id.
vec3 cells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + vec2(hash12(i + g), hash12(i + g + 19.7)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g + 5.3); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
float groundAt(vec2 xz) {
  vec2 t = clamp(xz - uHeightRect.xy, vec2(0.0), uHeightRect.zw - 1.001);
  ivec2 i = ivec2(floor(t));
  vec2 f = fract(t);
  float a = texelFetch(uHeights, i, 0).r, b = texelFetch(uHeights, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeights, i + ivec2(0, 1), 0).r, d = texelFetch(uHeights, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`

/** Liquid looks, in the order the shader numbers them (uLook). */
const LOOKS = ['water', 'lava', 'acid', 'ice', 'swamp', 'tar', 'silt']

/** Sets col (color), alpha and glow (emitted light) for this fragment. */
const SURFACE = /* glsl */ `
vec2 xz = vWorld.xz;
vec2 block = floor(xz * 4.0); // 25 cm: the pixel-art unit for dithering
// Surface patterns ride the current: sampled where the water now here was at time 0.
vec2 fp = xz - uFlowVel * uTime;
vec2 fblock = floor(fp * 4.0);
float speed = length(uFlowVel);
float depth = max(uLevel - groundAt(xz), 0.0);
float dd = clamp(depth / uDepthScale, 0.0, 1.0);
float t = uTime * uFlow;
// Four flat bands from shore to deep, dithered where they meet.
float band4 = clamp(floor(dd * 3.999 + (hash12(block) - 0.5) * 0.45), 0.0, 3.0) / 3.0;
vec3 col = mix(uShallow, uDeep, band4);
float alpha = mix(uOpacity.x, uOpacity.y, band4);
vec3 glow = vec3(0.0);
float night = 1.0 - uDay;
float light = 0.35 + 0.65 * uDay;
bool liquidLook = uLook == 0 || uLook == 2 || uLook == 4 || uLook == 6;

if (uLook == 1) {
  // Lava: dark crust plates drifting on glowing cracks; the cracks widen and brighten in pulses.
  vec2 q = fp * 0.8 + vec2(t * 0.12, t * 0.07);
  vec3 c = cells(q);
  float pulse = 0.5 + 0.5 * sin(uTime * 1.3 + c.z * 6.28);
  float crack = 1.0 - smoothstep(0.03, 0.11 + 0.05 * pulse, c.y);
  float hot = clamp(crack + (1.0 - band4) * 0.35 * step(0.6, vnoise(q * 2.0 + uTime * 0.2)), 0.0, 1.0);
  vec3 crust = mix(vec3(0.03, 0.016, 0.012), vec3(0.07, 0.035, 0.022), c.z);
  vec3 molten = mix(uDeep, uShallow, hot * hot);
  col = mix(crust, molten, step(0.5, hot));
  glow = molten * step(0.5, hot) * uGlow * (0.3 + 0.7 * night);
  // A crust rim where it meets the shore.
  col = mix(col, uFoam, step(0.6, 1.0 - smoothstep(0.0, uEdge, depth) + hash12(block) * 0.3));
} else if (uLook == 3) {
  // Ice: still; pale cracks, a frosted rim, a few glints by day.
  vec3 c = cells(xz * 0.45);
  col = mix(col, uFoam, (1.0 - smoothstep(0.03, 0.08, c.y)) * 0.6);
  col = mix(col, vec3(0.3, 0.45, 0.56), 1.0 - smoothstep(0.0, 0.035, c.y));
  col = mix(col, uFoam, step(0.55, 1.0 - smoothstep(0.0, uEdge * 1.5, depth) + hash12(block) * 0.35));
  col = mix(col, vec3(1.0), step(0.985, hash12(block + 3.0)) * uDay);
} else if (uLook == 5) {
  // Tar: almost black, a slow oily sheen drifting across.
  float sheen = sin(fp.x * 0.35 + fp.y * 0.22 + uTime * 0.25) * sin(fp.y * 0.5 - uTime * 0.18 + fp.x * 0.1);
  col = mix(col, vec3(0.05, 0.048, 0.055), step(0.55, sheen));
  col = mix(col, vec3(0.16, 0.15, 0.18), step(0.85, sheen) * light);
  col = mix(col, vec3(0.42, 0.4, 0.46), step(0.97, sheen) * light);
}

if (liquidLook) {
  // Caustics: light through clear shallows, drifting on the bed (water only).
  if (uLook == 0) {
    vec3 c = cells(fp * 0.6 + vec2(t * 0.1, -t * 0.07));
    float caustic = (1.0 - smoothstep(0.02, 0.05, c.y)) * step(band4, 0.34) * uDay;
    col = mix(col, uFoam, caustic * 0.22);
    alpha = max(alpha, caustic * 0.4);
  }
  // Muddy water: silt clouds drift through.
  if (uLook == 6) col = mix(col, uFoam, step(0.62, vnoise(fp * 0.9 + vec2(t * 0.2, t * 0.12))) * 0.22);
  // Swamp: algae mats and the odd lily pad.
  if (uLook == 4) {
    col = mix(col, vec3(0.16, 0.22, 0.06), step(0.62, vnoise(fp * 0.4 + t * 0.03)) * 0.8);
    vec2 cell = floor(fp / 1.6);
    vec2 at = (cell + 0.3 + 0.4 * vec2(hash12(cell), hash12(cell + 7.0))) * 1.6;
    float pad = step(hash12(cell + 2.0), 0.16) * step(length(fp - at), 0.38) * step(0.12, abs(atan(fp.y - at.y, fp.x - at.x) - 0.6));
    col = mix(col, vec3(0.13, 0.32, 0.09), pad);
    alpha = max(alpha, pad);
  }
  // Acid: bubbles grow and pop.
  if (uLook == 2) {
    vec2 cell = floor(fp / 0.7);
    vec2 at = (cell + 0.25 + 0.5 * vec2(hash12(cell + 1.0), hash12(cell + 9.0))) * 0.7;
    float life = fract(uTime * 0.35 + hash12(cell + 4.0));
    float ring = step(abs(length(fp - at) - life * 0.2), 0.035) * step(0.55, hash12(cell + 6.0)) * step(life, 0.9);
    col = mix(col, uFoam, ring);
    glow = col * uGlow * (0.15 + 0.85 * night) * 0.6;
  }
  // The sky's color on clear water, more at the deep end.
  if (uLook == 0) col = mix(col, uSky, 0.04 + 0.08 * band4);
  // Glints on the wave crests: sunlight by day, fainter moonlight at night.
  float crest = sin(fp.x * 0.7 + fp.y * 0.4 + t * 0.8) * sin(fp.y * 0.9 - t * 0.5);
  float glint = step(0.94, crest) * step(0.86, hash12(fblock + floor(uTime * 2.0))) * uSparkle;
  // Moving water: foam streaks stretched along the current, more the faster it runs.
  if (speed > 0.01) {
    vec2 d = uFlowVel / speed;
    float along = dot(fp, d), across = dot(xz, vec2(-d.y, d.x));
    float streak = step(0.74, vnoise(vec2(along * 0.45, across * 2.2))) * min(1.0, speed / 1.5);
    col = mix(col, uFoam, streak * 0.4);
    alpha = max(alpha, streak * 0.6);
  }
  col = mix(col, mix(vec3(0.55, 0.62, 0.8), vec3(1.0, 0.98, 0.9), uDay), glint * (0.4 + 0.6 * uDay));
  alpha = max(alpha, glint * 0.9);
}

if (uLook != 1 && uLook != 3) {
  // Shore foam laps in and out; a thin wave line runs up the slope and fades.
  float reach = uEdge * (0.75 + 0.35 * sin(uTime * 1.1 * max(uFlow, 0.2)));
  float rim = step(0.55, 1.0 - smoothstep(0.0, reach, depth) + hash12(block) * 0.3);
  float phase = fract(uTime * 0.22 * max(uFlow, 0.2));
  float line = step(abs(depth - uEdge * (2.6 - 2.0 * phase)), 0.05) * (1.0 - phase) * step(0.55, hash12(block + 11.0));
  float foam = max(rim * 0.85, line * 0.6) * (uLook == 5 ? 0.0 : 1.0);
  col = mix(col, uFoam, foam);
  alpha = max(alpha, foam);
}
diffuseColor = vec4(col, alpha);`

export function buildWater(obj: MapObject, doc: MapDocument): THREE.Mesh | null {
  const polygon = obj.props.get('polygon') as PackedVec2Array | null
  if (!polygon || polygon.points.length < 3) return null
  const shape = new THREE.Shape(polygon.points.map((p) => new THREE.Vector2(p.x, p.y)))
  // Islands, or other liquids cut out of this one (see editor/water-shapes.ts).
  const holes = obj.props.get('holes')
  if (Array.isArray(holes)) {
    for (const h of holes) if (h instanceof PackedVec2Array && h.points.length >= 3) shape.holes.push(new THREE.Path(h.points.map((p) => new THREE.Vector2(p.x, p.y))))
  }
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
  // Current: `flow_speed` m/s toward `flow_dir` degrees in the body's own frame (so it turns
  // with the body), as a world x / z velocity.
  const speed = Math.max(0, Number(obj.props.get('flow_speed') ?? 0))
  const angle = (Number(obj.props.get('flow_dir') ?? 0) * Math.PI) / 180 - yaw
  const flowVel = new THREE.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed)
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
      uLook: { value: LOOKS.indexOf(l.look) }, uFlowVel: { value: flowVel }, ...waterEnv,
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${SURFACE}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glow;')
  }
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.renderOrder = 1
  mesh.userData.dispose = () => heights.dispose()
  mesh.userData.flowVel = flowVel
  return mesh
}
