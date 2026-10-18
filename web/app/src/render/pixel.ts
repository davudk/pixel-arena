// Pixel renderer + camera rig (ports of PixelView and CameraRig from the Godot version).
// A PixelPass renders the scene into a low-resolution target (output size / pixel size plus a
// margin), then one full-screen post pass upscales it with nearest sampling and applies the
// whole filter stack: oil paint (Kuwahara), outlines (depth Laplacian silhouettes + creases from
// a low-res view-normal pass), ACES tone mapping, sRGB conversion, color grading, palette /
// level quantization with ordered dither, scanlines, vignette and grain. Doing tone mapping and
// sRGB in our own shader keeps offscreen exports identical to the screen.
// The screen camera is snapped to whole texels and the leftover sub-texel offset shifts the
// upscaled image instead, so panning is smooth without pixel crawl.

import * as THREE from 'three'
import { OPTIONS, PALETTES, type FilterOptions } from './filters'
import { GRID_LAYER, gridUniforms } from './grid'
import { showGrid } from './terrain-shading'

export const MARGIN = 2
const MAX_OIL = 6

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform sampler2D uPalette;
uniform vec2 sourceSize;   // low-res target size (texels)
uniform vec2 outputSize;   // output size (device pixels)
uniform float pixelSize;   // device pixels per texel
uniform vec2 offset;       // sub-texel camera remainder, in texels
uniform float near;
uniform float far;
uniform float exposure;
uniform float outline;
uniform vec3 outlineColor;
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform vec3 tint;
uniform float tintAmount;
uniform int colorLevels;   // > 1: quantize each channel to this many levels
uniform int paletteSize;   // > 0: snap to the nearest palette color
uniform float dither;
uniform int oil;
uniform float vignette;
uniform float grain;
uniform float scanlines;
uniform float time;
varying vec2 vUv;

const float BAYER[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 normalAt(ivec2 p) {
  vec4 n = texelFetch(tNormal, p, 0);
  return n.a < 0.5 ? vec3(0.0) : normalize(n.xyz * 2.0 - 1.0);
}

float viewDepth(ivec2 p) {
  return near + texelFetch(tDepth, p, 0).r * (far - near); // orthographic: depth is linear
}

// Kuwahara: average of the least-varying of the four quadrants around the texel.
vec3 kuwahara(ivec2 p, int r) {
  vec3 best = texelFetch(tColor, p, 0).rgb;
  float bestVar = 1e9;
  for (int q = 0; q < 4; q++) {
    ivec2 dir = ivec2(q % 2 == 0 ? -1 : 1, q < 2 ? -1 : 1);
    vec3 sum = vec3(0.0);
    vec3 sum2 = vec3(0.0);
    float n = 0.0;
    for (int y = 0; y <= ${MAX_OIL}; y++) {
      if (y > r) break;
      for (int x = 0; x <= ${MAX_OIL}; x++) {
        if (x > r) break;
        vec3 c = min(texelFetch(tColor, p + ivec2(x, y) * dir, 0).rgb, vec3(4.0));
        sum += c;
        sum2 += c * c;
        n += 1.0;
      }
    }
    vec3 mean = sum / n;
    vec3 v = sum2 / n - mean * mean;
    float var = v.r + v.g + v.b;
    if (var < bestVar) { bestVar = var; best = mean; }
  }
  return best;
}

// three.js's ACES filmic fit (same curve the screen used before).
vec3 acesFilmic(vec3 color) {
  const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = inputMat * color;
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  return clamp(outputMat * (a / b), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 src = vUv * outputSize / pixelSize + vec2(${MARGIN}.0) + vec2(-offset.x, offset.y);
  ivec2 p = ivec2(floor(src));
  vec3 c = oil > 0 ? kuwahara(p, oil) : texelFetch(tColor, p, 0).rgb;
  if (outline > 0.0) {
    float d = viewDepth(p);
    float lap = viewDepth(p + ivec2(1, 0)) + viewDepth(p - ivec2(1, 0)) + viewDepth(p + ivec2(0, 1)) + viewDepth(p - ivec2(0, 1)) - 4.0 * d;
    float edge = step(0.06 + d * 0.012, lap);
    vec3 n = normalAt(p);
    if (dot(n, n) > 0.5) {
      float nd = min(dot(n, normalAt(p + ivec2(1, 0))), dot(n, normalAt(p + ivec2(0, 1))));
      edge = max(edge, (1.0 - smoothstep(0.55, 0.75, nd)) * 0.6);
    }
    c = mix(c, outlineColor, edge * outline);
  }
  c = toSrgb(acesFilmic(c));

  // Grading (sRGB space).
  c = (c - 0.5) * contrast + 0.5 + brightness;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, saturation);
  c = mix(c, luma * tint * 1.6, tintAmount);
  c = clamp(c, 0.0, 1.0);

  // Quantization with ordered dither, per rendered texel.
  float threshold = (BAYER[(p.y % 4) * 4 + p.x % 4] + 0.5) / 16.0 - 0.5;
  if (paletteSize > 0) {
    vec3 target = c + threshold * dither * 0.25;
    float best = 1e9;
    vec3 pick = c;
    for (int i = 0; i < 32; i++) {
      if (i >= paletteSize) break;
      vec3 q = texelFetch(uPalette, ivec2(i, 0), 0).rgb;
      vec3 dd = target - q;
      float dist = dot(dd * vec3(0.299, 0.587, 0.114), dd) + dot(dd, dd) * 0.2;
      if (dist < best) { best = dist; pick = q; }
    }
    c = pick;
  } else if (colorLevels > 1) {
    float steps = float(colorLevels - 1);
    c = clamp(floor((c + threshold * dither / steps) * steps + 0.5) / steps, 0.0, 1.0);
  }

  if (scanlines > 0.0) c *= 1.0 - scanlines * smoothstep(0.55, 1.0, 1.0 - fract(src.y));
  if (vignette > 0.0) c *= 1.0 - vignette * smoothstep(0.25, 0.75, length((vUv - 0.5) * vec2(1.0, 0.8)));
  if (grain > 0.0) c += (hash12(vec2(p) + floor(time * 12.0) * 17.0) - 0.5) * grain;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); // already sRGB
}`

const paletteTextures = new Map<string, THREE.DataTexture>()
function paletteTexture(name: string): THREE.DataTexture | null {
  const colors = PALETTES[name]
  if (!colors) return null
  if (!paletteTextures.has(name)) {
    const data = new Uint8Array(colors.length * 4)
    colors.forEach((hex, i) => data.set([parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255], i * 4))
    const tex = new THREE.DataTexture(data, colors.length, 1)
    tex.needsUpdate = true
    paletteTextures.set(name, tex)
  }
  return paletteTextures.get(name)!
}

/** Low-res scene render + post pass, reusable for the screen and for offscreen exports. */
export class PixelPass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, {
    magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType), type: THREE.HalfFloatType,
  })
  readonly normals = new THREE.WebGLRenderTarget(1, 1, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  readonly material: THREE.ShaderMaterial
  /** Draw calls / triangles of the last scene pass (excluding the post pass). */
  readonly sceneInfo = { calls: 0, triangles: 0 }
  private normalMaterial = new THREE.MeshNormalMaterial()
  private postScene = new THREE.Scene()
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private clock = new THREE.Clock()
  private gridCamera = new THREE.OrthographicCamera()
  /** Grid line width in output pixels (the screen uses one CSS pixel). */
  gridLineWidth = 1

  constructor(private renderer: THREE.WebGLRenderer) {
    const u = (value: unknown) => ({ value })
    this.material = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, toneMapped: false,
      uniforms: {
        tColor: u(this.target.texture), tDepth: u(this.target.depthTexture), tNormal: u(this.normals.texture),
        uPalette: u(null), sourceSize: u(new THREE.Vector2()), outputSize: u(new THREE.Vector2()), pixelSize: u(1),
        offset: u(new THREE.Vector2()), near: u(0.5), far: u(1000), exposure: u(1.05),
        outline: u(0), outlineColor: u(new THREE.Color('#1a1626')), brightness: u(0), contrast: u(1), saturation: u(1),
        tint: u(new THREE.Color('#ffffff')), tintAmount: u(0), colorLevels: u(0), paletteSize: u(0), dither: u(0),
        oil: u(0), vignette: u(0), grain: u(0), scanlines: u(0), time: u(0),
      },
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material))
    this.applyFilter(OPTIONS)
  }

  get outline(): number {
    return this.material.uniforms.outline.value
  }

  /** Sets every filter uniform from resolved options (pixel size is handled by the caller). */
  applyFilter(o: FilterOptions) {
    const u = this.material.uniforms
    const pal = paletteTexture(o.palette)
    u.outline.value = Number(o.outline)
    u.outlineColor.value.set(o.outline_color)
    u.brightness.value = Number(o.brightness)
    u.contrast.value = Number(o.contrast)
    u.saturation.value = Number(o.saturation)
    // Tint is applied in sRGB space, so use the hex value's sRGB components directly.
    u.tint.value.setRGB(...hexToRgb(o.tint))
    u.tintAmount.value = Number(o.tint_amount)
    u.colorLevels.value = o.palette === 'levels' ? Number(o.color_levels) : 0
    u.uPalette.value = pal
    u.paletteSize.value = pal ? PALETTES[o.palette].length : 0
    u.dither.value = Number(o.dither)
    u.oil.value = Math.min(Number(o.oil), MAX_OIL)
    u.vignette.value = Number(o.vignette)
    u.grain.value = Number(o.grain)
    u.scanlines.value = Number(o.scanlines)
  }

  /** Renders `scene` through `camera` into `low` texels and post-processes it to `out` device
   *  pixels (into `output`, or the canvas when null). `camera` must frame the whole low-res
   *  target, margins included. */
  render(scene: THREE.Scene, camera: THREE.OrthographicCamera, low: THREE.Vector2, out: THREE.Vector2, pixelSize: number, offset: THREE.Vector2, output: THREE.WebGLRenderTarget | null) {
    const r = this.renderer
    if (this.target.width !== low.x || this.target.height !== low.y) {
      this.target.setSize(low.x, low.y)
      this.normals.setSize(low.x, low.y)
    }
    const u = this.material.uniforms
    u.sourceSize.value.copy(low)
    u.outputSize.value.copy(out)
    u.pixelSize.value = pixelSize
    u.offset.value.copy(offset)
    u.near.value = camera.near
    u.far.value = camera.far
    u.time.value = this.clock.getElapsedTime()
    r.setRenderTarget(this.target)
    r.render(scene, camera)
    this.sceneInfo.calls = r.info.render.calls
    this.sceneInfo.triangles = r.info.render.triangles
    if (u.outline.value > 0) {
      const bg = scene.background
      scene.background = null
      scene.overrideMaterial = this.normalMaterial
      r.setRenderTarget(this.normals)
      r.setClearColor(0x000000, 0)
      r.clear()
      r.render(scene, camera)
      r.setClearColor(0x000000, 1)
      scene.overrideMaterial = null
      scene.background = bg
    }
    r.setRenderTarget(output)
    r.render(this.postScene, this.postCamera)
    if (showGrid.value) this.renderGrid(scene, camera, low, out, pixelSize, offset)
    r.setRenderTarget(null)
  }

  /** Draws the grid layer over the finished image at output resolution (see grid.ts). */
  private renderGrid(scene: THREE.Scene, camera: THREE.OrthographicCamera, low: THREE.Vector2, out: THREE.Vector2, pixelSize: number, offset: THREE.Vector2) {
    const r = this.renderer
    // The part of the low-res frame the output shows: from the margin, shifted by the sub-texel
    // offset, out / pixelSize texels across (same mapping as the post shader).
    const cam = this.gridCamera
    cam.copy(camera)
    const tx = (camera.right - camera.left) / low.x
    const ty = (camera.top - camera.bottom) / low.y
    cam.left = camera.left + (MARGIN - offset.x) * tx
    cam.right = cam.left + (out.x / pixelSize) * tx
    cam.bottom = camera.bottom + (MARGIN + offset.y) * ty
    cam.top = cam.bottom + (out.y / pixelSize) * ty
    cam.layers.set(GRID_LAYER)
    cam.updateProjectionMatrix()
    gridUniforms.tDepth.value = this.target.depthTexture
    gridUniforms.pixelSize.value = pixelSize
    gridUniforms.offset.value.copy(offset)
    gridUniforms.margin.value = MARGIN
    gridUniforms.near.value = camera.near
    gridUniforms.far.value = camera.far
    gridUniforms.lineWidth.value = this.gridLineWidth
    const bg = scene.background
    const autoClear = r.autoClear
    const shadows = r.shadowMap.autoUpdate
    scene.background = null
    r.autoClear = false
    r.shadowMap.autoUpdate = false
    r.render(scene, cam)
    r.shadowMap.autoUpdate = shadows
    r.autoClear = autoClear
    scene.background = bg
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
}

/** The on-screen renderer: a PixelPass sized to the canvas. */
export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly pass: PixelPass
  /** Size of one rendered pixel in CSS pixels (points), like the Godot version. */
  pixelSize = 3
  /** Low-res size including margins (texels). */
  readonly low = new THREE.Vector2(1, 1)
  /** Canvas size in device pixels. */
  readonly out = new THREE.Vector2(1, 1)

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.NoToneMapping // done in the post pass
    this.pass = new PixelPass(this.renderer)
  }

  get sceneInfo() {
    return this.pass.sceneInfo
  }

  /** Rendered pixel size in device pixels. */
  get devicePixelSize(): number {
    return this.pixelSize * window.devicePixelRatio
  }

  resize(cssWidth: number, cssHeight: number) {
    const dpr = window.devicePixelRatio
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(cssWidth, cssHeight, false)
    this.pass.gridLineWidth = Math.max(1, Math.round(dpr))
    this.out.set(Math.round(cssWidth * dpr), Math.round(cssHeight * dpr))
    const px = this.devicePixelSize
    this.low.set(Math.ceil(this.out.x / px) + MARGIN * 2, Math.ceil(this.out.y / px) + MARGIN * 2)
  }

  render(scene: THREE.Scene, rig: CameraRig) {
    this.pass.render(scene, rig.camera, this.low, this.out, this.devicePixelSize, rig.subpixel, null)
  }

  /** World point -> screen position in CSS px (inverse of toNdc), or null if behind. */
  toScreen(world: THREE.Vector3, rig: CameraRig): THREE.Vector2 | null {
    const ndc = world.clone().project(rig.camera)
    if (ndc.z < -1 || ndc.z > 1) return null
    const dpr = window.devicePixelRatio
    const px = this.devicePixelSize
    const sx = ((ndc.x + 1) / 2) * this.low.x
    const sy = ((ndc.y + 1) / 2) * this.low.y
    return new THREE.Vector2(((sx - MARGIN + rig.subpixel.x) * px) / dpr, (this.out.y - (sy - MARGIN - rig.subpixel.y) * px) / dpr)
  }

  /** Screen (CSS px) -> normalized device coords of the low-res camera (for raycasts). */
  toNdc(cssX: number, cssY: number, rig: CameraRig): THREE.Vector2 {
    // Same mapping as the post pass (texel coordinates from the bottom-left).
    const dpr = window.devicePixelRatio
    const px = this.devicePixelSize
    const sx = (cssX * dpr) / px + MARGIN - rig.subpixel.x
    const sy = (this.out.y - cssY * dpr) / px + MARGIN + rig.subpixel.y
    return new THREE.Vector2((sx / this.low.x) * 2 - 1, (sy / this.low.y) * 2 - 1)
  }
}

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera()
  focus = new THREE.Vector3()
  yaw = Math.PI / 4
  pitch = -Math.atan(1 / Math.SQRT2) // true isometric
  zoom = 40 // visible world height (m)
  readonly subpixel = new THREE.Vector2()
  private yawTarget = this.yaw

  constructor(private pixel: PixelRenderer) {}

  /** Turns the whole rig by `angle` around the vertical axis through `pivot`, immediately
   *  (trackpad gestures follow the fingers). With the ground point at the screen centre as the
   *  pivot, that point stays put on screen. */
  rotateAround(pivot: THREE.Vector3, angle: number) {
    const offset = this.focus.clone().sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    this.focus.set(pivot.x + offset.x, this.focus.y, pivot.z + offset.z)
    this.yaw += angle
    this.yawTarget += angle
  }

  rotateBy(angle: number) {
    this.yawTarget += angle
  }

  update(dt: number) {
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 14))
    const basis = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
    const back = new THREE.Vector3(0, 0, 1).applyMatrix4(basis)
    const dist = this.zoom * 2 + 50
    let pos = this.focus.clone().addScaledVector(back, dist)

    // Frustum covers the whole low-res target (margin included); texel = world size of one texel.
    const visibleTexels = this.pixel.out.y / this.pixel.devicePixelSize
    const texel = this.zoom / visibleTexels
    const halfW = (this.pixel.low.x * texel) / 2
    const halfH = (this.pixel.low.y * texel) / 2
    const cam = this.camera
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH
    cam.near = 0.5
    cam.far = dist * 2 + this.zoom * 4

    this.subpixel.set(0, 0)
    if (this.pixel.pixelSize > 1) {
      // Snap the camera's screen-plane position to whole texels; keep the remainder as offset.
      const inv = basis.clone().transpose()
      const local = pos.clone().applyMatrix4(inv)
      const sx = Math.round(local.x / texel) * texel
      const sy = Math.round(local.y / texel) * texel
      this.subpixel.set(-(local.x - sx) / texel, (local.y - sy) / texel)
      pos = new THREE.Vector3(sx, sy, local.z).applyMatrix4(basis)
    }
    cam.position.copy(pos)
    cam.quaternion.setFromRotationMatrix(basis)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }

  /** Pans so the ground point under `from` ends up under `to`. The focus stays on its
   *  horizontal plane: the move is slid along the view direction (which doesn't change the
   *  orthographic image), so panning over hills doesn't make the focus drift up or down. */
  panScreen(from: THREE.Vector3 | null, to: THREE.Vector3 | null) {
    if (!from || !to) return
    const move = from.sub(to)
    const view = this.camera.getWorldDirection(new THREE.Vector3())
    if (Math.abs(view.y) > 1e-6) move.addScaledVector(view, -move.y / view.y)
    this.focus.add(move)
  }

  /** Pans in screen directions scaled by zoom (keyboard). */
  panRelative(dx: number, dy: number) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.focus.addScaledVector(right, dx * this.zoom).addScaledVector(forward, -dy * this.zoom)
  }
}
