// Editor indicators (selection rings and outlines, brush rings, polygon outlines, axes) are never
// filtered: they live on OVERLAY_LAYER, which the pixel pass leaves out of the low-res render and
// draws after the post pass at full resolution (PixelPass.renderOverlay). Lines are wide lines a
// fixed number of screen pixels wide. An `occluded` line is hidden where the scene stands in
// front of it, by comparing its depth with the low-res depth (the same test as the grid), so a
// selection ring still disappears behind the object it circles.
//
// Rule for new indicators: build lines with overlayLine(), put everything else through
// toOverlay(), and mark the root `userData.overlay` so exports leave it out.

import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

/** Objects only on this layer skip the low-res pass and filters; drawn after, at full
 *  resolution. */
export const OVERLAY_LAYER = 2

/** Set by PixelPass before each overlay render: the low-res depth and how output pixels map to
 *  its texels, and the output size in device pixels (wide lines' resolution). */
export const overlayDepth = {
  oDepth: { value: null as THREE.Texture | null },
  oPixelSize: { value: 1 },
  oOffset: { value: new THREE.Vector2() },
  oMargin: { value: 0 },
  oNear: { value: 0.5 },
  oFar: { value: 1000 },
  oTexel: { value: 0.1 }, // world meters per low-res texel
}
export const overlayResolution = new THREE.Vector2(1, 1)

export interface LineOptions {
  color: THREE.ColorRepresentation
  /** CSS px (default 2). */
  width?: number
  opacity?: number
  /** Hidden where the scene stands in front (default true). */
  occluded?: boolean
  /** Dash and gap in world meters. */
  dashed?: [number, number]
  /** Pairs of points (separate segments) instead of a polyline. */
  segments?: boolean
  /** Join the last point back to the first. */
  closed?: boolean
}

/** A wide line on the overlay layer. */
export function overlayLine(points: THREE.Vector3[], o: LineOptions): Line2 | LineSegments2 {
  const mat = new LineMaterial({
    color: new THREE.Color(o.color).getHex(), linewidth: (o.width ?? 2) * window.devicePixelRatio,
    transparent: true, opacity: o.opacity ?? 1, depthTest: false, depthWrite: false,
    dashed: !!o.dashed, dashSize: o.dashed?.[0] ?? 1, gapSize: o.dashed?.[1] ?? 1,
  })
  mat.uniforms.resolution.value = overlayResolution
  if (o.occluded ?? true) occlude(mat)
  const line = o.segments ? new LineSegments2(new LineSegmentsGeometry(), mat) : new Line2(new LineGeometry(), mat)
  setLinePoints(line, points, o.closed)
  line.userData.closed = !!o.closed
  toOverlay(line)
  return line
}

/** New points for an overlay line (e.g. a brush ring following the cursor). */
export function setLinePoints(line: Line2 | LineSegments2, points: THREE.Vector3[], closed = line.userData.closed as boolean) {
  const pts = closed && points.length ? [...points, points[0]] : points
  const flat = pts.flatMap((p) => [p.x, p.y, p.z])
  if (line instanceof Line2) {
    line.geometry.dispose()
    line.geometry = new LineGeometry().setPositions(flat.length >= 6 ? flat : [0, 0, 0, 0, 0, 0])
  } else {
    line.geometry.dispose()
    line.geometry = new LineSegmentsGeometry().setPositions(flat.length >= 6 ? flat : [0, 0, 0, 0, 0, 0])
  }
  if ((line.material as LineMaterial).dashed) line.computeLineDistances()
}

/** Puts an object and everything under it on the overlay layer (never picked, never culled). */
export function toOverlay<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    c.layers.set(OVERLAY_LAYER)
    c.frustumCulled = false
    c.raycast = () => {}
  })
  return o
}

/** Hides the line where the low-res scene depth is in front of it (see grid.ts for the test). */
function occlude(mat: LineMaterial) {
  mat.customProgramCacheKey = () => 'overlay-line-occluded'
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, overlayDepth)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vOverlayZ;')
      .replace('vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation',
        'vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation\nvOverlayZ = -mvPosition.z;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vOverlayZ;
uniform sampler2D oDepth;
uniform float oPixelSize, oMargin, oNear, oFar, oTexel;
uniform vec2 oOffset;`)
      .replace('void main() {', `void main() {
  // The low-res texel the post pass shows at this output pixel; a texel's worth of slack.
  vec2 src = gl_FragCoord.xy / oPixelSize + vec2(oMargin) + vec2(-oOffset.x, oOffset.y);
  float sceneZ = oNear + texelFetch(oDepth, ivec2(floor(src)), 0).r * (oFar - oNear);
  if (vOverlayZ > sceneZ + 0.05 + oTexel * 2.0) discard;`)
  }
}
